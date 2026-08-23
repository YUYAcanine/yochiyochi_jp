import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { getAuthedContext } from "@/lib/apiAuth";
import { resolveFoodId } from "@/lib/foodNameResolver";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const runtime = "nodejs";

type AccidentRow = {
  id: string;
  created_at: string;
  child_id: string | null;
  food_id: number | null;
  food_name: string | null;
  content: string | null;
  is_public: boolean | null;
  garden_id: string | null;
};

const resolveChildId = async (
  client: SupabaseClient<Database>,
  gardenId: string,
  childName: string
): Promise<string | null> => {
  const trimmed = childName.trim();
  if (!trimmed) return null;

  const { data, error } = await client
    .from("children")
    .select("id")
    .eq("garden_id", gardenId)
    .eq("name", trimmed)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (error || !data?.id) return null;
  return data.id;
};

const buildFoodNameMap = async (client: SupabaseClient<Database>, foodIds: number[]) => {
  const foodNameMap = new Map<number, string>();
  if (foodIds.length === 0) return foodNameMap;

  const { data } = await client.from("foods").select("id, name").in("id", foodIds).returns<
    Array<{ id: number; name: string | null }>
  >();
  for (const row of data ?? []) {
    if (typeof row.name === "string") foodNameMap.set(row.id, row.name);
  }
  return foodNameMap;
};

const mapAccidentItems = async (
  client: SupabaseClient<Database>,
  accidents: AccidentRow[],
  childRows: Array<{ id: string; name: string | null }>,
  options: { includeChildName: boolean }
) => {
  const childNameMap = new Map<string, string>(childRows.map((row) => [row.id, (row.name ?? "").trim()]));

  const foodIds = Array.from(
    new Set(
      accidents
        .filter((row) => !row.food_name?.trim())
        .map((row) => row.food_id)
        .filter((id): id is number => typeof id === "number")
    )
  );
  const foodNameMap = await buildFoodNameMap(client, foodIds);

  return accidents.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    // is_public=trueの行は未ログインの第三者にも配信されるため、
    // 園児の実名(PII)は includeChildName=false のときは含めない。
    child_name: options.includeChildName && row.child_id ? childNameMap.get(row.child_id) ?? "" : "",
    // 園独自食材は未ログインからfoodsを引けずRLSで空になりうるため、
    // 報告時点の食材名(food_name)をそのまま優先して表示する。
    food_name:
      row.food_name?.trim() ||
      (typeof row.food_id === "number" ? foodNameMap.get(row.food_id) ?? "" : ""),
    accident_content: row.content ?? "",
    public: row.is_public,
    // 実際の garden_id は個人特定につながりうるため返却せず、真偽値のみ渡す
    from_garden: row.garden_id !== null,
  }));
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const publicOnly = searchParams.get("public") === "true";
    const limit = Number(searchParams.get("limit") ?? "200");
    const normalizedLimit = Number.isNaN(limit) ? 200 : Math.min(limit, 200);

    if (publicOnly) {
      // 公開フィードは未ログインでも見られる（RLSのis_public=true許可による）
      const { data: accidentData, error: accidentError } = await supabase
        .from("accidents")
        .select("id, created_at, child_id, food_id, food_name, content, is_public, garden_id")
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(normalizedLimit)
        .returns<AccidentRow[]>();

      if (accidentError) {
        console.error(accidentError);
        return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
      }

      const accidents = accidentData ?? [];
      // 未ログインの公開フィードなので、園児の実名は解決・返却しない。
      const items = await mapAccidentItems(supabase, accidents, [], { includeChildName: false });
      return NextResponse.json({ items });
    }

    const ctx = await getAuthedContext(req);
    if (!ctx) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { supabase: authedSupabase, gardenId } = ctx;

    const { data: accidentData, error: accidentError } = await authedSupabase
      .from("accidents")
      .select("id, created_at, child_id, food_id, content, is_public, garden_id")
      .eq("garden_id", gardenId)
      .order("created_at", { ascending: false })
      .limit(normalizedLimit)
      .returns<AccidentRow[]>();

    if (accidentError) {
      console.error(accidentError);
      return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
    }

    const accidents = accidentData ?? [];
    const { data: childData, error: childError } = await authedSupabase
      .from("children")
      .select("id, name")
      .eq("garden_id", gardenId)
      .returns<Array<{ id: string; name: string | null }>>();

    if (childError) {
      console.error(childError);
      return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
    }

    const items = await mapAccidentItems(authedSupabase, accidents, childData ?? [], { includeChildName: true });
    return NextResponse.json({ items });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthedContext(req);
    if (!ctx) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { supabase: authedSupabase, gardenId } = ctx;

    const { child_name, food_name, accident_content, public: isPublic, food_id } = await req.json();

    if (!child_name || !food_name || !accident_content) {
      return NextResponse.json({ error: "必須項目を入力してください" }, { status: 400 });
    }

    const childId = await resolveChildId(authedSupabase, gardenId, child_name);
    if (childId == null) {
      return NextResponse.json({ error: "園児情報タブで園児を登録してください" }, { status: 400 });
    }

    const resolvedFoodId =
      typeof food_id === "number" ? food_id : await resolveFoodId(authedSupabase, gardenId, food_name);
    if (resolvedFoodId == null) {
      return NextResponse.json({ error: "登録済みの食材を選択してください" }, { status: 400 });
    }

    const { error } = await authedSupabase.from("accidents").insert({
      garden_id: gardenId,
      child_id: childId,
      food_id: resolvedFoodId,
      food_name: food_name.trim(),
      content: accident_content,
      is_public: Boolean(isPublic),
    });

    if (error) {
      console.error(error);
      return NextResponse.json({ error: "登録に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "登録に失敗しました" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = await getAuthedContext(req);
    if (!ctx) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { supabase: authedSupabase, gardenId } = ctx;

    const { id, child_name, food_name, accident_content, public: isPublic, food_id } = await req.json();

    if (typeof id !== "string" || !child_name || !food_name || !accident_content) {
      return NextResponse.json({ error: "必須項目を入力してください" }, { status: 400 });
    }

    const childId = await resolveChildId(authedSupabase, gardenId, child_name);
    if (childId == null) {
      return NextResponse.json({ error: "園児情報タブで園児を登録してください" }, { status: 400 });
    }

    const resolvedFoodId =
      typeof food_id === "number" ? food_id : await resolveFoodId(authedSupabase, gardenId, food_name);
    if (resolvedFoodId == null) {
      return NextResponse.json({ error: "登録済みの食材を選択してください" }, { status: 400 });
    }

    // RLSにより自園以外のgarden_idの行は更新できない（見えない）ため、
    // ここでは明示的な所有チェックはせずgarden_id条件だけ付与する
    const { error, count } = await authedSupabase
      .from("accidents")
      .update(
        {
          child_id: childId,
          food_id: resolvedFoodId,
          food_name: food_name.trim(),
          content: accident_content,
          is_public: Boolean(isPublic),
        },
        { count: "exact" }
      )
      .eq("id", id)
      .eq("garden_id", gardenId);

    if (error) {
      console.error(error);
      return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
    }
    if (count === 0) {
      return NextResponse.json({ error: "更新対象が見つかりません" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await getAuthedContext(req);
    if (!ctx) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { supabase: authedSupabase, gardenId } = ctx;

    const { id } = await req.json();
    if (typeof id !== "string") {
      return NextResponse.json({ error: "必須項目を入力してください" }, { status: 400 });
    }

    // RLSにより自園以外のgarden_idの行は削除できない（見えない）ため、
    // ここでは明示的な所有チェックはせずgarden_id条件だけ付与する
    const { error, count } = await authedSupabase
      .from("accidents")
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("garden_id", gardenId);

    if (error) {
      console.error(error);
      return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
    }
    if (count === 0) {
      return NextResponse.json({ error: "削除対象が見つかりません" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
