"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { canon } from "@/lib/textNormalize";
import { getCurrentGardenId } from "@/lib/currentGarden";

export type MenuInfo = {
  phase1?: string;
  phase2?: string;
  phase3?: string;
  phase4?: string;
  phase5?: string;
};

type FoodRow = {
  id: number;
  name: string | null;
};

type CookingMethodRow = {
  food_id: number;
  phase1: string | null;
  phase2: string | null;
  phase3: string | null;
  phase4: string | null;
  phase5: string | null;
};

type FoodAliasRow = {
  food_id: number;
  alias: string | null;
};

const toMenuInfo = (row: CookingMethodRow | undefined): MenuInfo => ({
  phase1: row?.phase1?.trim() ?? undefined,
  phase2: row?.phase2?.trim() ?? undefined,
  phase3: row?.phase3?.trim() ?? undefined,
  phase4: row?.phase4?.trim() ?? undefined,
  phase5: row?.phase5?.trim() ?? undefined,
});

export function useMenuData(reloadTick?: number) {
  const [menuMap, setMenuMap] = useState<Record<string, MenuInfo>>({});
  const [foodIdMap, setFoodIdMap] = useState<Record<string, number>>({});
  const [cookIdMap, setCookIdMap] = useState<Record<string, number>>({});
  const [foodNameOptions, setFoodNameOptions] = useState<string[]>([]);
  const [canonicalNameMap, setCanonicalNameMap] = useState<Record<string, string>>({});
  const [eventTick, setEventTick] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onCookUpdated = () => setEventTick((prev) => prev + 1);
    window.addEventListener("yochi-cook-updated", onCookUpdated);
    return () => window.removeEventListener("yochi-cook-updated", onCookUpdated);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchMenuData() {
      try {
        const gardenId = await getCurrentGardenId();

        const [{ data: globalFoods, error: globalFoodsError }, { data: globalMethods }] = await Promise.all([
          supabase.from("foods").select("id, name").is("garden_id", null).returns<FoodRow[]>(),
          supabase
            .from("cooking_methods")
            .select("food_id, phase1, phase2, phase3, phase4, phase5")
            .is("garden_id", null)
            .returns<CookingMethodRow[]>(),
        ]);

        if (globalFoodsError || !globalFoods || cancelled) return;

        const methodsByFoodId = new Map<number, CookingMethodRow>();
        (globalMethods ?? []).forEach((row) => methodsByFoodId.set(row.food_id, row));

        const map: Record<string, MenuInfo> = {};
        const idMap: Record<string, number> = {};
        const displayMap: Record<string, string> = {};
        const idToKey = new Map<number, string>();
        const canonicalKeyToId = new Map<string, number>();
        const nameSet = new Set<string>();

        for (const food of globalFoods) {
          const displayName = (food.name ?? "").trim();
          if (displayName) nameSet.add(displayName);

          const key = canon(food.name ?? "");
          if (!key) continue;

          idMap[key] = food.id;
          displayMap[key] = displayName || (food.name ?? "");
          idToKey.set(food.id, key);
          canonicalKeyToId.set(key, food.id);
          map[key] = toMenuInfo(methodsByFoodId.get(food.id));
        }

        const { data: aliasData } = await supabase
          .from("food_aliases")
          .select("food_id, alias")
          .returns<FoodAliasRow[]>();

        (aliasData ?? []).forEach((row) => {
          const canonicalKey = row.food_id != null ? idToKey.get(row.food_id) : undefined;
          const aliasKey = canon(row.alias ?? "");
          if (!canonicalKey || !aliasKey || !map[canonicalKey]) return;

          map[aliasKey] = map[canonicalKey];
          displayMap[aliasKey] = displayMap[canonicalKey];
          const foodId = canonicalKeyToId.get(canonicalKey);
          if (foodId != null) idMap[aliasKey] = foodId;
        });

        if (gardenId) {
          const [{ data: gardenFoods }, { data: gardenMethods }] = await Promise.all([
            supabase.from("foods").select("id, name").eq("garden_id", gardenId).returns<FoodRow[]>(),
            supabase
              .from("cooking_methods")
              .select("food_id, phase1, phase2, phase3, phase4, phase5")
              .eq("garden_id", gardenId)
              .returns<CookingMethodRow[]>(),
          ]);

          const gardenMethodsByFoodId = new Map<number, CookingMethodRow>();
          (gardenMethods ?? []).forEach((row) => gardenMethodsByFoodId.set(row.food_id, row));

          // 共通食材に対して園が保存した調理方法も反映する。
          // 別名キーは同じオブジェクトを参照しているので、差し替えずに上書きする。
          (gardenMethods ?? []).forEach((row) => {
            const key = idToKey.get(row.food_id);
            if (!key || !map[key]) return;
            Object.assign(map[key], {
              phase1: row.phase1?.trim() ?? map[key].phase1,
              phase2: row.phase2?.trim() ?? map[key].phase2,
              phase3: row.phase3?.trim() ?? map[key].phase3,
              phase4: row.phase4?.trim() ?? map[key].phase4,
              phase5: row.phase5?.trim() ?? map[key].phase5,
            });
          });

          (gardenFoods ?? []).forEach((food) => {
            const displayName = (food.name ?? "").trim();
            if (displayName) nameSet.add(displayName);

            const key = idToKey.get(food.id) ?? canon(food.name ?? "");
            if (!key) return;

            idToKey.set(food.id, key);
            if (!(key in idMap)) idMap[key] = food.id;
            if (!(key in displayMap)) displayMap[key] = displayName || (food.name ?? "");

            const override = gardenMethodsByFoodId.get(food.id);
            map[key] = {
              phase1: override?.phase1?.trim() ?? map[key]?.phase1,
              phase2: override?.phase2?.trim() ?? map[key]?.phase2,
              phase3: override?.phase3?.trim() ?? map[key]?.phase3,
              phase4: override?.phase4?.trim() ?? map[key]?.phase4,
              phase5: override?.phase5?.trim() ?? map[key]?.phase5,
            };
          });
        }

        if (cancelled) return;
        setMenuMap(map);
        setFoodIdMap(idMap);
        setCookIdMap({});
        setCanonicalNameMap(displayMap);
        setFoodNameOptions(Array.from(nameSet).sort((a, b) => a.localeCompare(b, "ja")));
      } catch (e) {
        console.error("useMenuData error:", e);
      }
    }

    fetchMenuData();
    return () => {
      cancelled = true;
    };
  }, [reloadTick, eventTick]);

  const updateMenuForKey = (key: string, phaseKey: keyof MenuInfo, value: string | null) => {
    setMenuMap((prev) => {
      const current = prev[key] ?? {};
      return {
        ...prev,
        [key]: {
          ...current,
          [phaseKey]: value ?? undefined,
        },
      };
    });
  };

  return {
    menuMap,
    foodIdMap,
    cookIdMap,
    foodNameOptions,
    canonicalNameMap,
    updateMenuForKey,
  };
}
