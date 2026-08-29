"use client";

/**
 * このページの役割
 * - 画像（カメラ/アルバム）を選ぶ
 * - OCR結果のテキスト領域(boxes)を画像上に重ねて表示
 * - タップされたテキストをメニュー辞書に照合し、フェーズ別に判定
 * - 選択中は下部ドロワーに判定結果/事故情報を表示
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import Ribbon from "@/components/Ribbon";
import LoadingSpinner from "@/components/LoadingSpinner";
import { PHASE_LABELS, useChecklist } from "@/components/checklist";
import PhaseSelectDropdown from "@/components/PhaseSelectDropdown";

import { Camera, Image as ImageIcon, Search } from "lucide-react";
import type { ChangeEvent, ComponentProps } from "react";

import OcrStage from "@/components/OcrStage";
import OcrBottomDrawer from "@/components/OcrBottomDrawer";
import OcrImage from "@/components/OcrImage";

import { useOCR } from "@/hooks/useOCR";
import { useMenuData } from "@/hooks/useMenuData";
import { useAccidentInfo } from "@/hooks/useAccidentInfo";
import { useImageInput } from "@/hooks/useImageInput";

import { canon } from "@/lib/textNormalize";
import { trackGaEvent } from "@/lib/ga";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentGardenId } from "@/lib/currentGarden";
import type { PhaseKey } from "@/types/food";

/* 型：OcrImageの型から参照して揃える */
type OcrImageProps = ComponentProps<typeof OcrImage>;
type Box = OcrImageProps["boxes"][number];
type ScaleInfo = OcrImageProps["scale"];

type Variant = "forbidden" | "ok" | "none" | "child" | "forbidden_child" | "ok_child";
type CookVariant = "forbidden" | "ok" | "none";

type Classified = {
  variant: Variant;
  cookVariant: CookVariant;
  cookText: string;
  childText: string;
};

type MenuInfo = {
  phase1?: string;
  phase2?: string;
  phase3?: string;
  phase4?: string;
  phase5?: string;
};

type ChildFoodItem = {
  child_name: string;
  no_eat: string;
  can_eat: boolean | null;
  note: string | null;
};

type AccidentFoodItem = {
  child_name: string;
  food_name: string;
  content: string;
};

const DEFAULT_SCALE: ScaleInfo = { scale: 1, offsetX: 0, offsetY: 0 };

/* 見た目用 */
const RIBBON_HEIGHT = "5rem" as const;
const RIBBON_SHIFT = "6rem" as const;

/* phase を menu のキーに変換（保険） */
const toMenuPhaseKey = (phase: PhaseKey): keyof MenuInfo => {
  if (
    phase === "phase1" ||
    phase === "phase2" ||
    phase === "phase3" ||
    phase === "phase4" ||
    phase === "phase5"
  ) {
    return phase;
  }
  return "phase1";
};

export default function Page2() {
  const router = useRouter();

  // 現在のフェーズ
  const { phase, setPhase } = useChecklist();

  const [memberId, setMemberId] = useState<string | null>(null);
  const [isEditingCook, setIsEditingCook] = useState(false);
  const [cookDrafts, setCookDrafts] = useState<MenuInfo>({
    phase1: "",
    phase2: "",
    phase3: "",
    phase4: "",
    phase5: "",
  });
  const [cookSaving, setCookSaving] = useState(false);
  const [cookMessage, setCookMessage] = useState<string | null>(null);
  const [enjiFoodItems, setEnjiFoodItems] = useState<ChildFoodItem[]>([]);
  const [accidentFoodItems, setAccidentFoodItems] = useState<AccidentFoodItem[]>([]);
  const lastSelectedTextRef = useRef<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedMemberId = localStorage.getItem("yochiMemberId");
    setMemberId(storedMemberId);
  }, []);

  // 画像と選択テキスト
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState<string>("");

  // テキスト選択中ならドロワーを開く
  const drawerOpen = Boolean(selectedText);

  // 辞書データ（食品名→フェーズ別説明、食品名→ID）
  const { menuMap, foodIdMap, updateMenuForKey } = useMenuData() as {
    menuMap: Record<string, MenuInfo>;
    foodIdMap: Record<string, number>;
    updateMenuForKey: (key: string, phaseKey: keyof MenuInfo, value: string | null) => void;
  };

  useEffect(() => {
    let cancelled = false;

    const fetchEnjiFoodItems = async () => {
      const gardenId = await getCurrentGardenId();
      if (!gardenId) {
        if (!cancelled) setEnjiFoodItems([]);
        return;
      }

      const { data: childRows } = await supabase
        .from("children")
        .select("id, name")
        .eq("garden_id", gardenId)
        .returns<Array<{ id: string; name: string | null }>>();

      const childIds = (childRows ?? []).map((row) => row.id);
      const childNameMap = new Map((childRows ?? []).map((row) => [row.id, row.name?.trim() ?? ""]));

      if (childIds.length === 0) {
        if (!cancelled) setEnjiFoodItems([]);
      } else {
        const { data: restrictionRows, error: restrictionError } = await supabase
          .from("child_food_restrictions")
          .select("child_id, cannot_eat, note, foods(name)")
          .in("child_id", childIds)
          .returns<
            Array<{
              child_id: string;
              cannot_eat: boolean;
              note: string | null;
              foods: { name: string | null } | null;
            }>
          >();

        if (!restrictionError && restrictionRows && !cancelled) {
          const nextItems: ChildFoodItem[] = restrictionRows
            .map((row): ChildFoodItem | null => {
              const foodName = row.foods?.name?.trim() ?? "";
              if (!foodName) return null;
              return {
                child_name: childNameMap.get(row.child_id) ?? "",
                no_eat: foodName,
                can_eat: !row.cannot_eat,
                note: row.note ?? null,
              };
            })
            .filter((item): item is ChildFoodItem => item !== null);

          setEnjiFoodItems(nextItems);
        }
      }

      const { data: accidentRows, error: accidentError } = await supabase
        .from("accidents")
        .select("child_id, content, foods(name)")
        .eq("garden_id", gardenId)
        .returns<
          Array<{
            child_id: string | null;
            content: string | null;
            foods: { name: string | null } | null;
          }>
        >();

      if (!accidentError && accidentRows && !cancelled) {
        const nextAccidents: AccidentFoodItem[] = accidentRows
          .map((row): AccidentFoodItem | null => {
            const foodName = row.foods?.name?.trim() ?? "";
            const content = row.content?.trim() ?? "";
            if (!foodName || !content) return null;
            return {
              child_name: row.child_id ? childNameMap.get(row.child_id) ?? "" : "",
              food_name: foodName,
              content,
            };
          })
          .filter((item): item is AccidentFoodItem => item !== null);

        setAccidentFoodItems(nextAccidents);
      }
    };

    fetchEnjiFoodItems();
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  const childFoodMap = useMemo(() => {
    const map = new Map<string, Array<{ name: string; note: string | null; canEat: boolean }>>();
    for (const child of enjiFoodItems) {
      const items = (child.no_eat ?? "")
        .split(/[,\s/\u3001\u30fb\uFF0C\uFF0F]+/)
        .map((item) => canon(item))
        .filter(Boolean);
      const uniqueItems = Array.from(new Set(items));
      for (const item of uniqueItems) {
        const list = map.get(item) ?? [];
        list.push({ name: child.child_name, note: child.note ?? null, canEat: child.can_eat === true });
        map.set(item, list);
      }
    }
    return map;
  }, [enjiFoodItems]);

  const accidentFoodMap = useMemo(() => {
    const map = new Map<string, Array<{ name: string; content: string }>>();
    for (const item of accidentFoodItems) {
      const key = canon(item.food_name);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push({ name: item.child_name, content: item.content });
      map.set(key, list);
    }
    return map;
  }, [accidentFoodItems]);

  const getChildEntries = useCallback(
    (raw?: string) => {
      const key = canon(raw);
      if (!key) return null;
      const list = childFoodMap.get(key);
      return list && list.length > 0 ? list : null;
    },
    [childFoodMap]
  );

  const getAccidentEntries = useCallback(
    (raw?: string) => {
      const key = canon(raw);
      if (!key) return null;
      const list = accidentFoodMap.get(key);
      return list && list.length > 0 ? list : null;
    },
    [accidentFoodMap]
  );

  const formatChildNotes = useCallback(
    (
      childEntries: Array<{ name: string; note: string | null; canEat: boolean }> | null,
      accidentEntries: Array<{ name: string; content: string }> | null
    ) => {
      const parts: string[] = [];

      if (childEntries && childEntries.length > 0) {
        const normalized = childEntries
          .map((entry) => ({
            name: (entry.name ?? "").trim(),
            note: (entry.note ?? "").trim(),
            canEat: entry.canEat,
          }))
          .filter((entry) => entry.name.length > 0);

        const lines = normalized.map((entry) => {
          const status = entry.canEat ? "食べられる" : "食べられない";
          const noteText = entry.note ? `（${entry.note}）` : "";
          return `・${entry.name}：${status}${noteText}`;
        });

        if (lines.length > 0) {
          parts.push(`【注意する食材】\n${lines.join("\n")}`);
        }
      }

      if (accidentEntries && accidentEntries.length > 0) {
        const lines = accidentEntries.map((entry) => {
          const name = entry.name?.trim();
          return `・${name ? `${name}：` : ""}${entry.content}`;
        });
        parts.push(`【ヒヤリハット報告】\n${lines.join("\n")}`);
      }

      return parts.join("\n\n");
    },
    []
  );

  // 事故情報
  const { accidentInfo, showAccidentInfo, loadingAccidentInfo, fetchByFoodId, reset: resetAccident } =
    useAccidentInfo();

  // 画像入力（file→dataURL）
  const { pickImageAsDataUrl } = useImageInput();

  // OCR（imgSrcが入ると実行）
  const { boxes, loading, scale, onImgLoad } = useOCR(imgSrc);

  /* 判定：選択文字を辞書に照合して forbidden/ok/none を返す */
  const classify = useCallback(
    (raw?: string): Classified => {
      const key = canon(raw);
      if (!key) {
        return { variant: "none", cookVariant: "none", cookText: "", childText: "" };
      }

      const childEntries = getChildEntries(raw);
      const accidentEntries = getAccidentEntries(raw);
      const hasFlag = Boolean(childEntries) || Boolean(accidentEntries);
      const childText = hasFlag ? formatChildNotes(childEntries, accidentEntries) : "";
      const info = menuMap[key];
      const phaseKey = toMenuPhaseKey(phase);
      const val = info?.[phaseKey]?.trim();
      const cookVariant: CookVariant =
        !val
          ? "none"
          : "ok";

      if (cookVariant === "none") {
        if (hasFlag) {
          return { variant: "child", cookVariant: "none", cookText: "", childText };
        }
        return { variant: "none", cookVariant: "none", cookText: "", childText: "" };
      }

      if (hasFlag) {
        return {
          variant: "ok_child",
          cookVariant,
          cookText: val ?? "",
          childText,
        };
      }

      return { variant: cookVariant, cookVariant, cookText: val ?? "", childText: "" };
    },
    [menuMap, phase, getChildEntries, getAccidentEntries, formatChildNotes]
  );

  // none は表示しない（重要なboxだけ見せる）
  const visibleFilter = useCallback(
    (b: Box) => classify(b.description).variant !== "none",
    [classify]
  );

  // boxの見た目用（色分けなど）
  const getBoxVariant = useCallback(
    (b: Box): Variant => classify(b.description).variant,
    [classify]
  );

  // ドロワーに出す判定結果
  const selected = useMemo<Classified>(() => {
    if (!selectedText) {
      return { variant: "none", cookVariant: "none", cookText: "", childText: "" };
    }
    return classify(selectedText);
  }, [selectedText, classify]);

  const buildCookDrafts = useCallback(
    (key: string | null): MenuInfo => {
      if (!key) {
        return { phase1: "", phase2: "", phase3: "", phase4: "", phase5: "" };
      }
      const info = menuMap[key];
      return {
        phase1: info?.phase1 ?? "",
        phase2: info?.phase2 ?? "",
        phase3: info?.phase3 ?? "",
        phase4: info?.phase4 ?? "",
        phase5: info?.phase5 ?? "",
      };
    },
    [menuMap]
  );

  useEffect(() => {
    const selectionChanged = selectedText !== lastSelectedTextRef.current;
    if (!selectedText) {
      setCookDrafts({ phase1: "", phase2: "", phase3: "", phase4: "", phase5: "" });
      setCookMessage(null);
      setIsEditingCook(false);
      lastSelectedTextRef.current = "";
      return;
    }
    if (!selectionChanged && isEditingCook) {
      return;
    }
    const key = canon(selectedText);
    setCookDrafts(buildCookDrafts(key));
    setCookMessage(null);
    setIsEditingCook(false);
    lastSelectedTextRef.current = selectedText;
  }, [selectedText, buildCookDrafts, isEditingCook]);

  /* 画像選択 */
  const handlePickFile = useCallback(
    async (file: File) => {
      const dataUrl = await pickImageAsDataUrl(file);
      setImgSrc(dataUrl);
      setSelectedText("");
      resetAccident();
    },
    [pickImageAsDataUrl, resetAccident]
  );

  /* boxをタップ */
  const handlePickText = useCallback(
    (text: string) => {
      setSelectedText(text);
      resetAccident();
      trackGaEvent("tap_food", {
        food_name: text,
        source: "ocr",
      });
    },
    [resetAccident]
  );

  /* ドロワー閉じる */
  const handleCloseDrawer = useCallback(() => {
    setSelectedText("");
    resetAccident();
    setIsEditingCook(false);
    setCookMessage(null);
  }, [resetAccident]);

  /* 画像リセット */
  const handleResetImage = useCallback(() => {
    setImgSrc(null);
    setSelectedText("");
    resetAccident();
  }, [resetAccident]);

  /* 事故情報表示（食品IDで取得） */
  const handleShowAccident = useCallback(async () => {
    if (!selectedText) return;
    const key = canon(selectedText);
    const foodId = key ? foodIdMap[key] : null;
    await fetchByFoodId(foodId);
  }, [selectedText, foodIdMap, fetchByFoodId]);

  const handleHideAccident = useCallback(() => {
    resetAccident();
  }, [resetAccident]);

  const handleStartEditCook = useCallback(() => {
    setIsEditingCook(true);
    setCookMessage(null);
    const key = canon(selectedText);
    setCookDrafts(buildCookDrafts(key));
  }, [selectedText, buildCookDrafts]);

  const handleCancelEditCook = useCallback(() => {
    setIsEditingCook(false);
    setCookMessage(null);
    const key = canon(selectedText);
    setCookDrafts(buildCookDrafts(key));
  }, [selectedText, buildCookDrafts]);

  const handleChangeCookDraft = useCallback((phaseKey: PhaseKey, value: string) => {
    setCookDrafts((prev) => ({ ...prev, [phaseKey]: value }));
  }, []);

  const handleSaveCook = useCallback(async () => {
    if (!selectedText) return;
    const key = canon(selectedText);
    if (!key) {
      setCookMessage("調理情報の編集に失敗しました。");
      return;
    }
    const gardenId = await getCurrentGardenId();
    if (gardenId == null) {
      setCookMessage("会員情報が見つかりません。");
      return;
    }
    const foodId = foodIdMap[key];
    if (!foodId) {
      setCookMessage("調理情報の編集に必要なIDが見つかりません。");
      return;
    }

    setCookSaving(true);
    try {
      const nextValues = {
        phase1: (cookDrafts.phase1 ?? "").trim() || null,
        phase2: (cookDrafts.phase2 ?? "").trim() || null,
        phase3: (cookDrafts.phase3 ?? "").trim() || null,
        phase4: (cookDrafts.phase4 ?? "").trim() || null,
        phase5: (cookDrafts.phase5 ?? "").trim() || null,
      };

      const { data: existing, error: existingError } = await supabase
        .from("cooking_methods")
        .select("id")
        .eq("garden_id", gardenId)
        .eq("food_id", foodId)
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;

      if (existing?.id != null) {
        const { error } = await supabase
          .from("cooking_methods")
          .update(nextValues)
          .eq("id", existing.id)
          .eq("garden_id", gardenId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cooking_methods").insert({
          garden_id: gardenId,
          food_id: foodId,
          ...nextValues,
        });
        if (error) throw error;
      }

      (["phase1", "phase2", "phase3", "phase4", "phase5"] as PhaseKey[]).forEach((phaseKey) => {
        updateMenuForKey(key, phaseKey, nextValues[phaseKey]);
      });

      setCookMessage("保存しました。");
      setIsEditingCook(false);
    } catch {
      setCookMessage("保存に失敗しました。");
    } finally {
      setCookSaving(false);
    }
  }, [selectedText, foodIdMap, cookDrafts, updateMenuForKey]);

  /* 検索画面へ */
  const handleGoSearch = useCallback(() => {
    router.push("/Search");
  }, [router]);

  /* input[type=file] 共通ハンドラ */
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      handlePickFile(file);
      e.target.value = ""; // 同じ画像を再選択できるように
    };

  /* 画像未選択時のUI */
  const UploadView = (
    <div className="mx-auto w-full max-w-3xl px-8 pt-10">
      <div className="space-y-8">
        <div className="flex items-center gap-4">
          <label className="flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center rounded-md border-2 border-[#b79f86] bg-[#E8DCD0] md:h-24 md:w-24">
            <Camera className="h-10 w-10 text-[#6B5A4E] md:h-12 md:w-12" />
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleChange}
              className="hidden"
            />
          </label>
          <div className="text-[#2f2a27]">
            <p className="text-xl font-bold text-[#5C3A2E]">写真モード</p>
            <p className="text-sm">献立表の写真をとるだけで</p>
            <p className="text-sm">材料名を認識して、調理における注意点を表示します</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center rounded-md border-2 border-[#b79f86] bg-[#E8DCD0] md:h-24 md:w-24">
            <ImageIcon className="h-10 w-10 text-[#6B5A4E] md:h-12 md:w-12" />
            <input
              type="file"
              accept="image/*"
              onChange={handleChange}
              className="hidden"
            />
          </label>
          <div className="text-[#2f2a27]">
            <p className="text-xl font-bold text-[#5C3A2E]">画像モード</p>
            <p className="text-sm">写真にとった献立表を選択し</p>
            <p className="text-sm">材料名を認識して、調理における注意点を表示します</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleGoSearch}
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border-2 border-[#b79f86] bg-[#E8DCD0] md:h-24 md:w-24"
            aria-label="検索モードへ"
          >
            <Search className="h-10 w-10 text-[#6B5A4E] md:h-12 md:w-12" />
          </button>
          <div className="text-[#2f2a27]">
            <p className="text-xl font-bold text-[#5C3A2E]">検索モード</p>
            <p className="text-sm">材料名で検索して、調理における注意点を表示します</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <main
      className="h-[100dvh] overflow-hidden overscroll-none bg-[#FAF8F6] text-[#4D3F36] relative flex flex-col"
      style={
        {
          "--ribbon-h": RIBBON_HEIGHT,
          "--ribbon-shift": RIBBON_SHIFT,
        } as React.CSSProperties
      }
    >
      <Ribbon
        href="/"
        logoSrc="/yoyochi3-ribbon.png"
        alt="よちヨチ ロゴ"
        heightClass="h-20"
        bgClass="bg-[#F0E4D8]"
        containerClassName="translate-y-0"
        logoClassName="h-[4.5rem] w-auto object-contain"
      />

      {imgSrc && (
        <PhaseSelectDropdown
          phase={phase as PhaseKey}
          onChangePhase={setPhase}
          labels={PHASE_LABELS}
          className="absolute top-24 right-4 z-30"
        />
      )}

      <div className="flex-grow pt-20">
        {imgSrc ? (
          <OcrStage
            imgSrc={imgSrc}
            boxes={boxes}
            loading={loading}
            scale={scale ?? DEFAULT_SCALE}
            phase={phase as PhaseKey}
            drawerOpen={drawerOpen}
            onImgLoad={onImgLoad}
            filterBox={visibleFilter}
            getVariant={getBoxVariant}
            onPickText={handlePickText}
            onReset={handleResetImage}
          />
        ) : (
          UploadView
        )}
      </div>

      <OcrBottomDrawer
        selectedText={selectedText}
        cookDescription={selected.cookText}
        childDescription={selected.childText}
        phase={phase as PhaseKey}
        variant={selected.variant}
        cookVariant={selected.cookVariant}
        onClose={handleCloseDrawer}
        onShowAccident={handleShowAccident}
        onHideAccident={handleHideAccident}
        accidentInfo={accidentInfo}
        showAccidentInfo={showAccidentInfo}
        loadingAccidentInfo={loadingAccidentInfo}
        cookEditor={{
          canEdit: Boolean(memberId),
          isEditing: isEditingCook,
          drafts: cookDrafts,
          onChangePhase: handleChangeCookDraft,
          onStart: handleStartEditCook,
          onCancel: handleCancelEditCook,
          onSave: handleSaveCook,
          saving: cookSaving,
          message: cookMessage,
        }}
      />

      {loading && <LoadingSpinner />}
    </main>
  );
}
