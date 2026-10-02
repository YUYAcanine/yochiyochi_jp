import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が設定されていません（.env.local を確認してください）"
  );
}

export type AuthedContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
  gardenId: string;
};

const bearerTokenFrom = (req: NextRequest): string | null => {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
};

// 認証結果のメモリキャッシュ。APIを呼ぶたびにSupabaseへ2往復（トークン検証と
// 所属園の検索）するのを避ける。トークン自体の有効期限を超えては保持しない。
const CONTEXT_CACHE_TTL_MS = 5 * 60 * 1000;
const CONTEXT_CACHE_MAX_ENTRIES = 500;
const contextCache = new Map<string, { userId: string; gardenId: string; expiresAt: number }>();

const decodeJwtPayload = (token: string): { sub?: string; exp?: number } | null => {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
};

const pruneContextCache = (now: number) => {
  if (contextCache.size < CONTEXT_CACHE_MAX_ENTRIES) return;
  for (const [key, entry] of contextCache) {
    if (entry.expiresAt <= now) contextCache.delete(key);
  }
  if (contextCache.size >= CONTEXT_CACHE_MAX_ENTRIES) contextCache.clear();
};

// リクエストのAuthorizationヘッダーからログインユーザーを特定し、
// そのユーザーが所属するgarden_idを解決する。
// 呼び出し元のfetchはlib/apiFetch.tsのauthedFetchを使うこと。
// fresh: true を渡すとキャッシュを使わず必ずSupabaseに問い合わせる（アカウント削除など）。
export const getAuthedContext = async (
  req: NextRequest,
  options: { fresh?: boolean } = {}
): Promise<AuthedContext | null> => {
  const token = bearerTokenFrom(req);
  if (!token) return null;

  const supabase = createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const now = Date.now();
  if (options.fresh) {
    contextCache.delete(token);
  } else {
    const cached = contextCache.get(token);
    if (cached && cached.expiresAt > now) {
      return { supabase, userId: cached.userId, gardenId: cached.gardenId };
    }
  }

  const findMembership = (userId: string) =>
    supabase.from("garden_members").select("garden_id").eq("user_id", userId).limit(1).maybeSingle();

  // トークンの検証と所属園の検索を同時に行う。トークン内のユーザーID(sub)は
  // 未検証なので、検証結果と一致したときだけその検索結果を採用する。
  const claims = decodeJwtPayload(token);
  const [{ data: userData, error: userError }, guessedMembership] = await Promise.all([
    supabase.auth.getUser(token),
    typeof claims?.sub === "string" ? findMembership(claims.sub) : null,
  ]);
  if (userError || !userData.user) return null;

  const { data: membership, error: membershipError } =
    guessedMembership && claims?.sub === userData.user.id
      ? guessedMembership
      : await findMembership(userData.user.id);

  if (membershipError || !membership) return null;

  if (!options.fresh) {
    pruneContextCache(now);
    const tokenExpiresAt = typeof claims?.exp === "number" ? claims.exp * 1000 : now;
    contextCache.set(token, {
      userId: userData.user.id,
      gardenId: membership.garden_id,
      expiresAt: Math.min(now + CONTEXT_CACHE_TTL_MS, tokenExpiresAt),
    });
  }

  return { supabase, userId: userData.user.id, gardenId: membership.garden_id };
};
