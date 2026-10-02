import { NextRequest, NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// アカウント削除。認証済みユーザー自身のgardenに紐づく全データ
// （園児情報・食材制限・調理方法・ヒヤリハット・園独自の食材・所属情報）を削除したのち、
// Supabase Authのユーザー自体を削除する。RLSに依存せず確実に消すため
// service role client（supabaseAdmin）で操作する。
export async function DELETE(req: NextRequest) {
  try {
    const ctx = await getAuthedContext(req, { fresh: true });
    if (!ctx) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { userId, gardenId } = ctx;

    const { data: childRows, error: childSelectError } = await supabaseAdmin
      .from("children")
      .select("id")
      .eq("garden_id", gardenId)
      .returns<Array<{ id: string }>>();

    if (childSelectError) {
      console.error(childSelectError);
      return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
    }

    const childIds = (childRows ?? []).map((row) => row.id);

    if (childIds.length > 0) {
      const { error: restrictionDeleteError } = await supabaseAdmin
        .from("child_food_restrictions")
        .delete()
        .in("child_id", childIds);
      if (restrictionDeleteError) {
        console.error(restrictionDeleteError);
        return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
      }
    }

    const { error: accidentDeleteError } = await supabaseAdmin
      .from("accidents")
      .delete()
      .eq("garden_id", gardenId);
    if (accidentDeleteError) {
      console.error(accidentDeleteError);
      return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
    }

    const { error: childDeleteError } = await supabaseAdmin
      .from("children")
      .delete()
      .eq("garden_id", gardenId);
    if (childDeleteError) {
      console.error(childDeleteError);
      return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
    }

    const { error: cookingMethodDeleteError } = await supabaseAdmin
      .from("cooking_methods")
      .delete()
      .eq("garden_id", gardenId);
    if (cookingMethodDeleteError) {
      console.error(cookingMethodDeleteError);
      return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
    }

    const { data: foodRows, error: foodSelectError } = await supabaseAdmin
      .from("foods")
      .select("id")
      .eq("garden_id", gardenId)
      .returns<Array<{ id: number }>>();
    if (foodSelectError) {
      console.error(foodSelectError);
      return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
    }

    const foodIds = (foodRows ?? []).map((row) => row.id);
    if (foodIds.length > 0) {
      const { error: foodAliasDeleteError } = await supabaseAdmin
        .from("food_aliases")
        .delete()
        .in("food_id", foodIds);
      if (foodAliasDeleteError) {
        console.error(foodAliasDeleteError);
        return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
      }

      const { error: foodDeleteError } = await supabaseAdmin
        .from("foods")
        .delete()
        .eq("garden_id", gardenId);
      if (foodDeleteError) {
        console.error(foodDeleteError);
        return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
      }
    }

    const { error: memberDeleteError } = await supabaseAdmin
      .from("garden_members")
      .delete()
      .eq("garden_id", gardenId);
    if (memberDeleteError) {
      console.error(memberDeleteError);
      return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
    }

    const { error: gardenDeleteError } = await supabaseAdmin
      .from("gardens")
      .delete()
      .eq("id", gardenId);
    if (gardenDeleteError) {
      console.error(gardenDeleteError);
      return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
    }

    const { error: userDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (userDeleteError) {
      console.error(userDeleteError);
      return NextResponse.json({ error: "アカウントの削除に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
