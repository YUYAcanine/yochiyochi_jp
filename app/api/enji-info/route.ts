import { NextRequest, NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/apiAuth";
import { resolveFoodId } from "@/lib/foodNameResolver";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const runtime = "nodejs";

const VIRTUAL_ID_PREFIX = "virtual:";

type ChildRow = {
  id: string;
  name: string | null;
  age_month: number | null;
  created_at: string;
};

type RestrictionRow = {
  id: string;
  child_id: string;
  food_id: number | null;
  cannot_eat: boolean | null;
  note: string | null;
  created_at: string;
};

// 前後の空白だけが違う名前も同じ園児として扱う（一覧は trim 済みの名前で表示しているため）
const findChildIdsByName = async (
  supabase: SupabaseClient<Database>,
  gardenId: string,
  childName: string
): Promise<string[] | null> => {
  const { data, error } = await supabase
    .from("children")
    .select("id, name")
    .eq("garden_id", gardenId)
    .order("created_at", { ascending: true })
    .returns<Array<{ id: string; name: string | null }>>();

  if (error) {
    console.error(error);
    return null;
  }

  const target = childName.trim();
  return (data ?? []).filter((row) => (row.name ?? "").trim() === target).map((row) => row.id);
};

const upsertChild = async (
  supabase: SupabaseClient<Database>,
  gardenId: string,
  childName: string,
  ageMonth: number
): Promise<string | null> => {
  const existingIds = await findChildIdsByName(supabase, gardenId, childName);
  if (existingIds == null) return null;

  if (existingIds.length > 0) {
    await supabase.from("children").update({ age_month: ageMonth }).eq("id", existingIds[0]);
    return existingIds[0];
  }

  const { data, error } = await supabase
    .from("children")
    .insert({ garden_id: gardenId, name: childName.trim(), age_month: ageMonth })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data?.id) return null;
  return data.id;
};

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthedContext(req);
    if (!ctx) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { supabase, gardenId } = ctx;

    const { child_name, age_month, no_eat, can_eat, note, food_id, mode } = await req.json();

    if (
      typeof child_name !== "string" ||
      !child_name.trim() ||
      typeof age_month !== "number" ||
      Number.isNaN(age_month)
    ) {
      return NextResponse.json({ error: "必須項目を入力してください" }, { status: 400 });
    }

    const childId = await upsertChild(supabase, gardenId, child_name, age_month);
    if (childId == null) {
      return NextResponse.json({ error: "園児情報の登録に失敗しました" }, { status: 500 });
    }

    // 園児追加は children のみ登録
    if (mode === "child") {
      return NextResponse.json({ ok: true, child_id: childId });
    }

    const noEatText = typeof no_eat === "string" ? no_eat : "";
    const resolvedFoodId =
      typeof food_id === "number" ? food_id : await resolveFoodId(supabase, gardenId, noEatText);
    if (resolvedFoodId == null) {
      return NextResponse.json({ error: "登録済みの食材を選択してください" }, { status: 400 });
    }

    const { error } = await supabase.from("child_food_restrictions").insert({
      child_id: childId,
      food_id: resolvedFoodId,
      cannot_eat: typeof can_eat === "boolean" ? !can_eat : true,
      note: typeof note === "string" ? note : "",
    });

    if (error) {
      console.error(error);
      return NextResponse.json({ error: "登録に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, child_id: childId });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "登録に失敗しました" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = await getAuthedContext(req);
    if (!ctx) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { supabase, gardenId } = ctx;

    const { id, child_name, age_month, no_eat, can_eat, note, food_id, mode, source_name } =
      await req.json();

    // 園児名の変更は children を直接更新する。
    // upsertChild 経由だと新しい名前の園児が別に作られ、元の園児が空のまま残ってしまう。
    if (mode === "child") {
      if (
        typeof source_name !== "string" ||
        !source_name.trim() ||
        typeof child_name !== "string" ||
        !child_name.trim() ||
        typeof age_month !== "number" ||
        Number.isNaN(age_month)
      ) {
        return NextResponse.json({ error: "必須項目を入力してください" }, { status: 400 });
      }

      const nextName = child_name.trim();
      const sourceIds = await findChildIdsByName(supabase, gardenId, source_name);
      if (sourceIds == null) {
        return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
      }
      if (sourceIds.length === 0) {
        return NextResponse.json({ error: "更新対象が見つかりません" }, { status: 404 });
      }

      if (nextName !== source_name.trim()) {
        const duplicateIds = await findChildIdsByName(supabase, gardenId, nextName);
        if (duplicateIds == null) {
          return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
        }
        if (duplicateIds.length > 0) {
          return NextResponse.json({ error: "同じ名前の園児がすでに登録されています" }, { status: 409 });
        }
      }

      const { error } = await supabase
        .from("children")
        .update({ name: nextName, age_month })
        .in("id", sourceIds);

      if (error) {
        console.error(error);
        return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    if (
      typeof id !== "string" ||
      typeof child_name !== "string" ||
      !child_name.trim() ||
      typeof age_month !== "number" ||
      Number.isNaN(age_month) ||
      typeof can_eat !== "boolean"
    ) {
      return NextResponse.json({ error: "必須項目を入力してください" }, { status: 400 });
    }

    const childId = await upsertChild(supabase, gardenId, child_name, age_month);
    if (childId == null) {
      return NextResponse.json({ error: "園児情報の更新に失敗しました" }, { status: 500 });
    }

    const noEatText = typeof no_eat === "string" ? no_eat : "";
    const resolvedFoodId =
      typeof food_id === "number" ? food_id : await resolveFoodId(supabase, gardenId, noEatText);
    if (resolvedFoodId == null) {
      return NextResponse.json({ error: "登録済みの食材を選択してください" }, { status: 400 });
    }

    const { error } = await supabase
      .from("child_food_restrictions")
      .update({
        child_id: childId,
        food_id: resolvedFoodId,
        cannot_eat: !can_eat,
        note: typeof note === "string" ? note : "",
      })
      .eq("id", id);

    if (error) {
      console.error(error);
      return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthedContext(req);
    if (!ctx) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { supabase, gardenId } = ctx;

    const [{ data: childData, error: childError }, { data: restrictionData, error: restrictionError }] =
      await Promise.all([
        supabase.from("children").select("id, name, age_month, created_at").eq("garden_id", gardenId).returns<ChildRow[]>(),
        supabase
          .from("child_food_restrictions")
          .select("id, child_id, food_id, cannot_eat, note, created_at, children!inner(garden_id)")
          .eq("children.garden_id", gardenId)
          .order("created_at", { ascending: false })
          .returns<RestrictionRow[]>(),
      ]);

    if (childError || restrictionError) {
      console.error(childError ?? restrictionError);
      return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
    }

    const childRows = childData ?? [];
    const restrictionRows = restrictionData ?? [];

    const childMap = new Map<string, { child_name: string; age_month: number; created_at: string }>();
    for (const row of childRows) {
      const name = (row.name ?? "").trim();
      if (!name) continue;
      childMap.set(row.id, {
        child_name: name,
        age_month: row.age_month ?? 0,
        created_at: row.created_at,
      });
    }

    const foodIds = Array.from(
      new Set(restrictionRows.map((row) => row.food_id).filter((id): id is number => typeof id === "number"))
    );

    const foodNameMap = new Map<number, string>();
    if (foodIds.length > 0) {
      const { data: foodRows } = await supabase
        .from("foods")
        .select("id, name")
        .in("id", foodIds)
        .returns<Array<{ id: number; name: string | null }>>();
      for (const row of foodRows ?? []) {
        if (typeof row.name === "string") foodNameMap.set(row.id, row.name);
      }
    }

    const items = restrictionRows.map((row) => {
      const child = childMap.get(row.child_id);
      return {
        id: row.id,
        child_name: child?.child_name ?? "園児",
        age_month: child?.age_month ?? 0,
        no_eat: typeof row.food_id === "number" ? foodNameMap.get(row.food_id) ?? "" : "",
        can_eat: row.cannot_eat === null ? null : !row.cannot_eat,
        note: row.note ?? "",
        created_at: row.created_at,
      };
    });

    // 食材制限が未登録の園児も一覧に出す（仮想行。DELETEでは無視する）
    const existingChildIds = new Set(restrictionRows.map((row) => row.child_id));
    for (const [childId, child] of childMap.entries()) {
      if (existingChildIds.has(childId)) continue;
      items.push({
        id: `${VIRTUAL_ID_PREFIX}${childId}`,
        child_name: child.child_name,
        age_month: child.age_month,
        no_eat: "",
        can_eat: true,
        note: "",
        created_at: child.created_at,
      });
    }

    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({ items });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await getAuthedContext(req);
    if (!ctx) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { supabase, gardenId } = ctx;

    const { id, child_name, delete_child } = await req.json();

    // 園児パネル削除: children から削除し、紐づく child_food_restrictions も削除
    if (delete_child === true && typeof child_name === "string" && child_name.trim()) {
      const childIds = await findChildIdsByName(supabase, gardenId, child_name);
      if (childIds == null) {
        return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
      }
      if (childIds.length === 0) {
        return NextResponse.json({ ok: true });
      }

      const { error: restrictionDeleteError } = await supabase
        .from("child_food_restrictions")
        .delete()
        .in("child_id", childIds);

      if (restrictionDeleteError) {
        console.error(restrictionDeleteError);
        return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
      }

      const { error: childDeleteError } = await supabase.from("children").delete().in("id", childIds);

      if (childDeleteError) {
        console.error(childDeleteError);
        return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    if (typeof id !== "string") {
      return NextResponse.json({ error: "必須項目を入力してください" }, { status: 400 });
    }

    // 疑似行（仮想ID）は child_food_restrictions 実体がないため無視
    if (id.startsWith(VIRTUAL_ID_PREFIX)) return NextResponse.json({ ok: true });

    const { error } = await supabase.from("child_food_restrictions").delete().eq("id", id);

    if (error) {
      console.error(error);
      return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
