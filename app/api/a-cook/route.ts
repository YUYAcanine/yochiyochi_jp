import { NextRequest, NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/apiAuth";

export const runtime = "nodejs";

type Payload = {
  food_name?: unknown;
  phase1?: unknown;
  phase2?: unknown;
  phase3?: unknown;
  phase4?: unknown;
  phase5?: unknown;
};

const toText = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
};

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthedContext(req);
    if (!ctx) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { supabase, gardenId } = ctx;

    const body = (await req.json()) as Payload;
    const foodName = toText(body.food_name);

    if (!foodName) {
      return NextResponse.json({ error: "食材名を入力してください" }, { status: 400 });
    }

    const updateValues = {
      phase1: toText(body.phase1),
      phase2: toText(body.phase2),
      phase3: toText(body.phase3),
      phase4: toText(body.phase4),
      phase5: toText(body.phase5),
    };

    // 共通食材（garden_id is null）に同名があればそれを使い、なければ園独自食材を探す。
    // 2つの検索は互いに依存しないので同時に行う。
    const [
      { data: globalFood, error: globalFoodError },
      { data: gardenFood, error: gardenFoodError },
    ] = await Promise.all([
      supabase
        .from("foods")
        .select("id")
        .is("garden_id", null)
        .eq("name", foodName)
        .limit(1)
        .maybeSingle<{ id: number }>(),
      supabase
        .from("foods")
        .select("id")
        .eq("garden_id", gardenId)
        .eq("name", foodName)
        .limit(1)
        .maybeSingle<{ id: number }>(),
    ]);

    if (globalFoodError) {
      console.error(globalFoodError);
      return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
    }

    let foodId = globalFood?.id ?? null;

    if (foodId == null) {
      if (gardenFoodError) {
        console.error(gardenFoodError);
        return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
      }

      foodId = gardenFood?.id ?? null;

      if (foodId == null) {
        const { data: inserted, error: insertFoodError } = await supabase
          .from("foods")
          .insert({ garden_id: gardenId, name: foodName })
          .select("id")
          .single<{ id: number }>();

        if (insertFoodError || !inserted) {
          console.error(insertFoodError);
          return NextResponse.json({ error: "食材の登録に失敗しました" }, { status: 500 });
        }
        foodId = inserted.id;
      }
    }

    const { data: existingMethod, error: existingMethodError } = await supabase
      .from("cooking_methods")
      .select("id")
      .eq("garden_id", gardenId)
      .eq("food_id", foodId)
      .limit(1)
      .maybeSingle<{ id: number }>();

    if (existingMethodError) {
      console.error(existingMethodError);
      return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
    }

    if (existingMethod?.id != null) {
      const { error: updateError } = await supabase
        .from("cooking_methods")
        .update(updateValues)
        .eq("id", existingMethod.id)
        .eq("garden_id", gardenId);

      if (updateError) {
        console.error(updateError);
        return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
      }

      return NextResponse.json({ ok: true, food_id: foodId });
    }

    const { error: insertMethodError } = await supabase.from("cooking_methods").insert({
      garden_id: gardenId,
      food_id: foodId,
      ...updateValues,
    });

    if (insertMethodError) {
      console.error(insertMethodError);
      return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, food_id: foodId });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
}
