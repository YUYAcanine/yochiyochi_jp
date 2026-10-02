"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Loader2, Pencil, Plus, Search, X } from "lucide-react";
import { useMenuData } from "@/hooks/useMenuData";
import { canon } from "@/lib/textNormalize";
import Ribbon from "@/components/Ribbon";
import { authedFetch } from "@/lib/apiFetch";
import EditModal from "@/components/EditModal";

type RegisterTab = "child" | "cook" | "hiyari";
const NEW_CHILD_SENTINEL = "__new_child__";
type ChildFormMode = "register" | "edit";
type CookDrafts = {
  phase1: string;
  phase2: string;
  phase3: string;
  phase4: string;
  phase5: string;
};

type AnswerItem = {
  id: string;
  child_name: string;
  age_month: number;
  no_eat: string;
  can_eat: boolean | null;
  note: string | null;
  created_at: string;
};

type AccidentItem = {
  id: string;
  child_name: string;
  food_name: string;
  food_id: number | null;
  accident_content: string;
  public: boolean | null;
  created_at: string;
};

type SuggestionInputProps = {
  value: string;
  onChangeValue: (value: string) => void;
  options: string[];
  className: string;
  wrapperClassName?: string;
  placeholder?: string;
  type?: "text" | "number";
  min?: number;
  unregisteredMessage?: string;
  duplicateMessage?: string;
  disableSuggestions?: boolean;
  // 正規化した名前（別名を含む）→ 登録名。渡すと別名での入力も登録済みとして扱う。
  aliasMap?: Record<string, string>;
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
};

// 一覧の取得。失敗したときは null を返す。
const fetchAnswerItems = async (): Promise<AnswerItem[] | null> => {
  try {
    const res = await authedFetch("/api/enji-info", { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    return (Array.isArray(json) ? json : json.items ?? []) as AnswerItem[];
  } catch {
    return null;
  }
};

const fetchAccidentItems = async (): Promise<AccidentItem[] | null> => {
  try {
    const res = await authedFetch(`/api/accidents?limit=200`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    return (Array.isArray(json) ? json : json.items ?? []) as AccidentItem[];
  } catch {
    return null;
  }
};

function SuggestionInput({
  value,
  onChangeValue,
  options,
  className,
  wrapperClassName,
  placeholder,
  type = "text",
  min,
  unregisteredMessage,
  duplicateMessage,
  disableSuggestions,
  aliasMap,
}: SuggestionInputProps) {
  const [open, setOpen] = useState(false);

  const suggestions = useMemo(() => {
    if (type !== "text" || disableSuggestions) return [];

    const unique = Array.from(
      new Set(
        options
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );

    const q = canon(value.trim());
    if (!q) return unique;

    const matched = new Set(
      unique.filter((item) => {
        const c = canon(item);
        return c.includes(q) || q.includes(c);
      })
    );
    // 別名（ひらがな表記など）で一致した食材も、登録名で候補に出す
    for (const [key, name] of Object.entries(aliasMap ?? {})) {
      if (key.includes(q) || q.includes(key)) matched.add(name);
    }

    return unique.filter((item) => matched.has(item));
  }, [value, options, type, disableSuggestions, aliasMap]);

  const showDropdown = type === "text" && open && suggestions.length > 0;

  const isUnregistered = useMemo(() => {
    if (!unregisteredMessage) return false;
    const q = canon(value.trim());
    if (!q) return false;
    if (aliasMap?.[q]) return false;
    return !options.some((item) => canon(item.trim()) === q);
  }, [value, options, unregisteredMessage, aliasMap]);

  const isDuplicate = useMemo(() => {
    if (!duplicateMessage) return false;
    const q = canon(value.trim());
    if (!q) return false;
    if (aliasMap?.[q]) return true;
    return options.some((item) => canon(item.trim()) === q);
  }, [value, options, duplicateMessage, aliasMap]);

  return (
    <div className={`relative ${wrapperClassName ?? ""}`}>
      <input
        type={type}
        min={min}
        value={value}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 80)}
        onChange={(e) => onChangeValue(e.target.value)}
        placeholder={placeholder}
        className={className}
      />
      {showDropdown && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.3rem)] z-20 max-h-56 overflow-y-auto rounded-lg border border-[#D3C5B9] bg-white shadow-lg">
          {suggestions.map((item) => (
            <button
              key={item}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChangeValue(item);
                setOpen(false);
              }}
              className="block w-full border-b border-[#F0E4D8] px-3 py-2 text-left text-sm text-[#2f2a27] hover:bg-[#F8E8E8] last:border-b-0"
            >
              {item}
            </button>
          ))}
        </div>
      )}
      {!showDropdown && isUnregistered && (
        <p className="mt-1 text-xs text-red-600">{unregisteredMessage}</p>
      )}
      {!showDropdown && !isUnregistered && isDuplicate && (
        <p className="mt-1 text-xs text-red-600">{duplicateMessage}</p>
      )}
    </div>
  );
}

export default function Page4() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<RegisterTab>("child");

  const [childName, setChildName] = useState("");
  const [ageMonth, setAgeMonth] = useState("0");
  const [noEat, setNoEat] = useState("");
  const [note, setNote] = useState("");
  const [isNoEatChecked, setIsNoEatChecked] = useState(false);
  const [childFormMode, setChildFormMode] = useState<ChildFormMode>("register");
  const [editingAnswerId, setEditingAnswerId] = useState<string | null>(null);
  const [foodEditTargetName, setFoodEditTargetName] = useState<string | null>(null);
  const [editingSourceName, setEditingSourceName] = useState<string | null>(null);
  const [showFoodForm, setShowFoodForm] = useState(false);

  const [accidentChildName, setAccidentChildName] = useState("");
  const [accidentFood, setAccidentFood] = useState("");
  const [accidentDetail, setAccidentDetail] = useState("");
  const [accidentPublic, setAccidentPublic] = useState(false);
  const [editingAccidentId, setEditingAccidentId] = useState<string | null>(null);
  // 食材が改名され食材名から逆引きできなくなった場合に備え、
  // 編集開始時点のfood_idを保持しておくフォールバック用。
  const [editingAccidentFoodId, setEditingAccidentFoodId] = useState<number | null>(null);
  const [cookFoodName, setCookFoodName] = useState("");
  const [cookDrafts, setCookDrafts] = useState<CookDrafts>({
    phase1: "",
    phase2: "",
    phase3: "",
    phase4: "",
    phase5: "",
  });

  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  const [authChecked, setAuthChecked] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [expandedNames, setExpandedNames] = useState<Record<string, boolean>>({});
  const [cookEditTargetName, setCookEditTargetName] = useState<string | null>(null);

  const [answerItems, setAnswerItems] = useState<AnswerItem[]>([]);
  const [accidentItems, setAccidentItems] = useState<AccidentItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [menuReloadTick, setMenuReloadTick] = useState(0);

  const { menuMap, foodIdMap, foodNameOptions, canonicalNameMap } = useMenuData(menuReloadTick);

  const accidentFoodId = useMemo(() => {
    const key = canon(accidentFood);
    if (!key) return null;
    return foodIdMap[key] ?? null;
  }, [accidentFood, foodIdMap]);

  const noEatFoodId = useMemo(() => {
    const key = canon(noEat);
    if (!key) return null;
    return foodIdMap[key] ?? null;
  }, [noEat, foodIdMap]);

  const cookFoodOptions = useMemo(() => {
    return foodNameOptions;
  }, [foodNameOptions]);

  const primaryActionLabel =
    activeTab === "cook" ? "食材登録" : activeTab === "hiyari" ? "ヒヤリハット報告" : "園児追加";

  const handleTabChange = (tab: RegisterTab) => {
    setActiveTab(tab);
    setShowForm(false);
    setFormMsg(null);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const loggedIn = localStorage.getItem("yochiLoggedIn") === "true";
    const storedMemberId = localStorage.getItem("yochiMemberId");
    if (!loggedIn || !storedMemberId) {
      router.replace("/login");
      return;
    }
    setMemberId(storedMemberId);
    setAuthChecked(true);
  }, [router]);

  useEffect(() => {
    if (!memberId) return;

    let cancelled = false;
    const fetchAll = async () => {
      setListLoading(true);
      const [answers, accidents] = await Promise.all([fetchAnswerItems(), fetchAccidentItems()]);
      if (cancelled) return;

      // 園児情報が取れなかったときは一覧全体を空にする（ヒヤリハットだけの失敗は空扱い）
      setAnswerItems(answers ?? []);
      setAccidentItems(answers ? accidents ?? [] : []);
      setListLoading(false);
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  const childOptions = useMemo(() => {
    const names = [
      ...answerItems.map((item) => item.child_name),
      ...accidentItems.map((item) => item.child_name),
    ]
      .map((name) => name.trim())
      .filter(Boolean);
    return Array.from(new Set(names));
  }, [answerItems, accidentItems]);

  const namesForTab = useMemo(() => {
    if (activeTab === "cook") {
      return cookFoodOptions.filter((name) =>
        name.toLowerCase().includes(searchText.trim().toLowerCase())
      );
    }
    if (activeTab === "hiyari") {
      return [];
    }

    const latestMap = new Map<string, number>();

    const addLatest = (name: string, createdAt: string) => {
      const t = new Date(createdAt).getTime();
      const prev = latestMap.get(name) ?? 0;
      if (t > prev) latestMap.set(name, t);
    };

    // 園児パネルは登録済みの園児(enji-info)だけから作る。
    // ヒヤリハットは園児が削除されると child_name が空で返るため、混ぜると名前のない空パネルが残る。
    if (activeTab === "child") {
      for (const item of answerItems) {
        if (!item.child_name.trim()) continue;
        addLatest(item.child_name, item.created_at);
      }
    }

    return Array.from(latestMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
      .filter((name) => name.toLowerCase().includes(searchText.trim().toLowerCase()));
  }, [activeTab, answerItems, searchText, cookFoodOptions]);

  const filteredAccidents = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return accidentItems.filter((item) =>
      q ? item.food_name.toLowerCase().includes(q) : true
    );
  }, [accidentItems, searchText]);

  const searchBoxOptions = useMemo(() => {
    if (activeTab === "cook" || activeTab === "hiyari") return cookFoodOptions;
    return childOptions;
  }, [activeTab, cookFoodOptions, childOptions]);

  useEffect(() => {
    if (namesForTab.length === 0) {
      setExpandedNames({});
      return;
    }

    setExpandedNames((prev) => {
      const next: Record<string, boolean> = {};
      for (const name of namesForTab) {
        next[name] = prev[name] ?? false;
      }
      return next;
    });
  }, [namesForTab]);

  useEffect(() => {
    setSearchText("");
  }, [activeTab]);

  useEffect(() => {
    const measure = () => {
      if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeTab, authChecked]);

  if (!authChecked) return null;

  // 保存後は関係する一覧だけを取り直す。取得に失敗したときは表示中の内容を残す。
  const reloadAnswers = async () => {
    const next = await fetchAnswerItems();
    if (next) setAnswerItems(next);
  };

  const reloadAccidents = async () => {
    const next = await fetchAccidentItems();
    if (next) setAccidentItems(next);
  };

  const toggleExpanded = (name: string) => {
    setExpandedNames((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const resetForms = () => {
    setChildName("");
    setAgeMonth("0");
    setNoEat("");
    setNote("");
    setEditingAnswerId(null);
    setChildFormMode("register");
    setAccidentChildName("");
    setAccidentFood("");
    setAccidentDetail("");
    setAccidentPublic(false);
    setEditingAccidentId(null);
    setEditingAccidentFoodId(null);
    setCookFoodName("");
    setCookEditTargetName(null);
    setCookDrafts({
      phase1: "",
      phase2: "",
      phase3: "",
      phase4: "",
      phase5: "",
    });
    setIsNoEatChecked(false);
    setFormMsg(null);
  };

  const loadCookDraftFromName = (name: string) => {
    const key = canon(name);
    const info = key ? menuMap[key] : undefined;
    setCookFoodName(name);
    setCookDrafts({
      phase1: info?.phase1 ?? "",
      phase2: info?.phase2 ?? "",
      phase3: info?.phase3 ?? "",
      phase4: info?.phase4 ?? "",
      phase5: info?.phase5 ?? "",
    });
  };

  const handleAddClick = () => {
    resetForms();
    setChildFormMode("register");
    setEditingAccidentId(null);
    if (activeTab === "child") {
      setFoodEditTargetName(NEW_CHILD_SENTINEL);
      setEditingSourceName(null);
      setShowFoodForm(false);
      setFormMsg(null);
      return;
    }
    setFoodEditTargetName(null);
    if (activeTab === "cook") {
      const q = searchText.trim();
      if (q) {
        loadCookDraftFromName(q);
      }
    } else if (activeTab === "hiyari") {
      const q = searchText.trim();
      if (q) {
        setAccidentFood(q);
      }
    }
    setShowForm(true);
    setFormMsg(null);
  };

  const openCookEditor = (foodName: string) => {
    loadCookDraftFromName(foodName);
    setShowForm(true);
    setFormMsg(null);
  };

  const startInlineCookEdit = (foodName: string) => {
    loadCookDraftFromName(foodName);
    setCookEditTargetName(foodName);
    setExpandedNames((prev) => ({ ...prev, [foodName]: true }));
    setFormMsg(null);
  };

  const cancelInlineCookEdit = () => {
    if (cookEditTargetName) {
      loadCookDraftFromName(cookEditTargetName);
    }
    setCookEditTargetName(null);
    setFormMsg(null);
  };

  const handleInlineCookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMsg(null);

    if (!cookEditTargetName) return;
    if (!memberId) {
      setFormMsg("ログイン情報を確認してください。");
      return;
    }

    setSubmitLoading(true);
    try {
      const res = await authedFetch("/api/a-cook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          food_name: cookEditTargetName,
          ...cookDrafts,
        }),
      });
      if (!res.ok) throw new Error("save failed");

      setFormMsg("更新しました。");
      setMenuReloadTick((prev) => prev + 1);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("yochi-cook-updated"));
      }
      setCookEditTargetName(null);
    } catch {
      setFormMsg("更新に失敗しました。");
    } finally {
      setSubmitLoading(false);
    }
  };

  const openEditorForName = (name: string) => {
    const answer =
      answerItems.find((item) => item.child_name === name && item.no_eat.trim().length > 0) ??
      answerItems.find((item) => item.child_name === name);
    const month = answer?.age_month ?? "";

    if (activeTab === "child") {
      setChildFormMode("edit");
      setEditingAnswerId(null);
      setFoodEditTargetName(name);
      setEditingSourceName(name);
      setExpandedNames((prev) => ({ ...prev, [name]: true }));
      setChildName(name);
      setAgeMonth(String(month || 0));
      setNoEat("");
      setIsNoEatChecked(false);
      setNote("");
      setShowFoodForm(false);
      setShowForm(false);
    } else {
      const target =
        accidentItems.find((item) => item.child_name === name) ??
        accidentItems.find((item) => item.food_name === name);
      if (target) {
        setEditingAccidentId(target.id);
        setEditingAccidentFoodId(target.food_id ?? null);
        setAccidentChildName(target.child_name);
        setAccidentFood(target.food_name);
        setAccidentDetail(target.accident_content);
        setAccidentPublic(target.public === true);
        setShowForm(true);
      }
    }

    setFormMsg(null);
  };

  const handleDeleteFood = async (item: AnswerItem) => {
    if (!memberId) return;
    if (!window.confirm("この食材を削除しますか？")) return;

    setFormMsg(null);
    setSubmitLoading(true);
    try {
      const res = await authedFetch("/api/enji-info", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      if (!res.ok) throw new Error("delete failed");
      setFormMsg("削除しました。");
      await reloadAnswers();
    } catch {
      setFormMsg("削除に失敗しました。");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteChildPanel = async (name: string) => {
    if (!memberId) return;
    if (
      !window.confirm(
        `${name}の園児情報を削除しますか？\n登録済みの注意する食材もすべて削除されます。`
      )
    )
      return;

    setFormMsg(null);
    setSubmitLoading(true);
    try {
      const res = await authedFetch("/api/enji-info", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          child_name: name,
          delete_child: true,
        }),
      });
      if (!res.ok) throw new Error("delete failed");

      if (foodEditTargetName === name) {
        closeInlineEditor();
      }
      setFormMsg("削除しました。");
      // 園児名はヒヤリハットにも表示されるので両方取り直す
      await Promise.all([reloadAnswers(), reloadAccidents()]);
    } catch {
      setFormMsg("削除に失敗しました。");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleStartEditFood = (item: AnswerItem) => {
    setChildFormMode("edit");
    setEditingAnswerId(item.id);
    setFoodEditTargetName(item.child_name);
    setEditingSourceName(item.child_name);
    setChildName(item.child_name);
    setAgeMonth(String(item.age_month));
    setNoEat(item.no_eat);
    setIsNoEatChecked(item.can_eat !== true);
    setNote(item.note ?? "");
    setShowFoodForm(true);
    setFormMsg(null);
  };

  const startAddFood = () => {
    setEditingAnswerId(null);
    setNoEat("");
    setNote("");
    setIsNoEatChecked(true);
    setShowFoodForm(true);
    setFormMsg(null);
  };

  const backToFoodList = () => {
    setEditingAnswerId(null);
    setNoEat("");
    setNote("");
    setIsNoEatChecked(false);
    setShowFoodForm(false);
    setFormMsg(null);
  };

  const handleNewChildSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMsg(null);

    const newName = childName.trim();
    if (!newName || !memberId) {
      setFormMsg("すべての必須項目を入力してください。");
      return;
    }

    setSubmitLoading(true);
    try {
      const body = {
        child_name: newName,
        age_month: Number(ageMonth),
        no_eat: "",
        can_eat: true,
        note: "",
        mode: "child",
      };

      const res = await authedFetch("/api/enji-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("save failed");

      setFormMsg("登録しました。食材を追加する場合は続けて登録できます。");
      await reloadAnswers();
      setChildName(newName);
      setFoodEditTargetName(newName);
      setEditingSourceName(newName);
    } catch {
      setFormMsg("登録に失敗しました。");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleChildNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMsg(null);

    const nextName = childName.trim();
    if (!nextName || !memberId) {
      setFormMsg("すべての必須項目を入力してください。");
      return;
    }

    setSubmitLoading(true);
    try {
      const res = await authedFetch("/api/enji-info", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "child",
          source_name: editingSourceName ?? nextName,
          child_name: nextName,
          age_month: Number(ageMonth),
        }),
      });

      if (res.status === 409) {
        setFormMsg("同じ名前の園児がすでに登録されています。");
        return;
      }
      if (!res.ok) throw new Error("update failed");

      // 園児名はヒヤリハットにも表示されるので両方取り直す
      await Promise.all([reloadAnswers(), reloadAccidents()]);
      closeInlineEditor();
    } catch {
      setFormMsg("保存に失敗しました。");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleFoodFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMsg(null);

    // 食材は編集中の園児に紐づける。未保存の園児名入力を使うと別の園児が作られ、
    // 食材の移動元が空のパネルとして残ってしまう。
    const targetChildName = (
      foodEditTargetName === NEW_CHILD_SENTINEL ? childName : editingSourceName ?? childName
    ).trim();
    if (!targetChildName || !memberId) {
      setFormMsg("すべての必須項目を入力してください。");
      return;
    }
    if (!noEat.trim()) {
      setFormMsg("食材名を入力してください。");
      return;
    }
    if (noEatFoodId == null) {
      setFormMsg("登録されている食材を選択してください。");
      return;
    }

    setSubmitLoading(true);
    try {
      const body = {
        child_name: targetChildName,
        age_month: Number(ageMonth),
        no_eat: noEat,
        can_eat: !isNoEatChecked,
        food_id: noEatFoodId,
        note,
      };

      const res = await authedFetch("/api/enji-info", {
        method: childFormMode === "edit" && editingAnswerId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          childFormMode === "edit" && editingAnswerId ? { id: editingAnswerId, ...body } : body
        ),
      });

      if (!res.ok) throw new Error("save failed");

      await reloadAnswers();
      if (foodEditTargetName === NEW_CHILD_SENTINEL) {
        setChildName(targetChildName);
        setFoodEditTargetName(targetChildName);
        setEditingSourceName(targetChildName);
      }
      backToFoodList();
    } catch {
      setFormMsg("保存に失敗しました。");
    } finally {
      setSubmitLoading(false);
    }
  };

  const closeInlineEditor = () => {
    setFoodEditTargetName(null);
    setEditingAnswerId(null);
    setEditingSourceName(null);
    setNoEat("");
    setNote("");
    setIsNoEatChecked(false);
    setShowFoodForm(false);
    setFormMsg(null);
  };

  // 編集開始時点の food_id は、食材名を変えていないときだけ引き継ぐ。
  // 未登録の名前に書き換えた場合まで引き継ぐと、表示名と紐づく食材が食い違う。
  const resolveAccidentFoodId = () => {
    if (accidentFoodId != null) return accidentFoodId;
    const original = accidentItems.find((item) => item.id === editingAccidentId);
    return original && original.food_name.trim() === accidentFood.trim() ? editingAccidentFoodId : null;
  };

  const handleAccidentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMsg(null);

    if (!accidentChildName || !accidentFood || !accidentDetail || !memberId) {
      setFormMsg("すべての必須項目を入力してください。");
      return;
    }

    setSubmitLoading(true);
    try {
      const res = await authedFetch("/api/accidents", {
        method: editingAccidentId != null ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingAccidentId,
          child_name: accidentChildName,
          food_name: accidentFood,
          accident_content: accidentDetail,
          public: accidentPublic,
          food_id: resolveAccidentFoodId() ?? undefined,
        }),
      });

      if (!res.ok) throw new Error("save failed");

      setFormMsg(editingAccidentId != null ? "更新しました。" : "登録しました。");
      await reloadAccidents();
      resetForms();
      setShowForm(false);
    } catch {
      setFormMsg("登録に失敗しました。");
    } finally {
      setSubmitLoading(false);
    }
  };

  const startInlineAccidentEdit = (item: AccidentItem) => {
    setEditingAccidentId(item.id);
    setEditingAccidentFoodId(item.food_id ?? null);
    setAccidentChildName(item.child_name);
    setAccidentFood(item.food_name);
    setAccidentDetail(item.accident_content);
    setAccidentPublic(item.public === true);
    setShowForm(false);
    setFormMsg(null);
  };

  const cancelInlineAccidentEdit = () => {
    setEditingAccidentId(null);
    setEditingAccidentFoodId(null);
    setAccidentChildName("");
    setAccidentFood("");
    setAccidentDetail("");
    setAccidentPublic(false);
    setFormMsg(null);
  };

  const handleDeleteAccident = async (id: string) => {
    if (!memberId) return;
    if (!window.confirm("このヒヤリハットを削除しますか？")) return;

    setFormMsg(null);
    setSubmitLoading(true);
    try {
      const res = await authedFetch("/api/accidents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("delete failed");

      if (editingAccidentId === id) {
        cancelInlineAccidentEdit();
      }
      setFormMsg("削除しました。");
      await reloadAccidents();
    } catch {
      setFormMsg("削除に失敗しました。");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleInlineAccidentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMsg(null);

    if (editingAccidentId == null || !accidentChildName || !accidentFood || !accidentDetail || !memberId) {
      setFormMsg("すべての必須項目を入力してください。");
      return;
    }
    const foodId = resolveAccidentFoodId();
    if (foodId == null) {
      setFormMsg("登録されている食材を選択してください。");
      return;
    }

    setSubmitLoading(true);
    try {
      const res = await authedFetch("/api/accidents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingAccidentId,
          child_name: accidentChildName,
          food_name: accidentFood,
          accident_content: accidentDetail,
          public: accidentPublic,
          food_id: foodId,
        }),
      });

      if (!res.ok) throw new Error("save failed");

      setFormMsg("更新しました。");
      await reloadAccidents();
      setEditingAccidentId(null);
      setEditingAccidentFoodId(null);
    } catch {
      setFormMsg("更新に失敗しました。");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleCookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMsg(null);

    if (!cookFoodName.trim()) {
      setFormMsg("食材名を入力してください。");
      return;
    }
    if (!memberId) {
      setFormMsg("ログイン情報を確認してください。");
      return;
    }

    // 表記だけが違う登録済みの食材（カタカナ/ひらがな等）は同じ食材として更新する。
    // 入力どおりに送ると同じ調理方法を共有する食材がもう1件作られてしまう。
    const foodName = canonicalNameMap[canon(cookFoodName)] ?? cookFoodName.trim();

    setSubmitLoading(true);
    try {
      const res = await authedFetch("/api/a-cook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          food_name: foodName,
          ...cookDrafts,
        }),
      });
      if (!res.ok) throw new Error("save failed");

      setFormMsg("登録しました。");
      setMenuReloadTick((prev) => prev + 1);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("yochi-cook-updated"));
      }
      setShowForm(false);
      resetForms();
    } catch {
      setFormMsg("登録に失敗しました。");
    } finally {
      setSubmitLoading(false);
    }
  };

  const preventImeEnterSubmit = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Enter") return;
    if (e.nativeEvent.isComposing) {
      e.preventDefault();
      return;
    }
    // input欄でのEnterは登録扱いにせず、キーボードを閉じるだけにする
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT") {
      e.preventDefault();
      target.blur();
    }
  };

  const renderChildPanel = (name: string) => {
    const noEatItems = answerItems.filter(
      (item) => item.child_name === name && item.no_eat.trim().length > 0
    );

    return (
      <div key={name} className="flex items-start gap-2">
        <div className="w-full rounded-md border border-[#E6D7C8] bg-white p-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => toggleExpanded(name)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleExpanded(name);
              }
            }}
            className="flex cursor-pointer items-center justify-between"
          >
            <div className="text-left text-lg font-bold text-[#5C3A2E]">{name}</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpanded(name);
                }}
                className="rounded p-1 text-[#8A776A]"
                aria-label={`${name}を${expandedNames[name] ? "収納" : "展開"}`}
              >
                {expandedNames[name] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openEditorForName(name);
                }}
                className="rounded p-1 text-brand hover:bg-[#F0E4D8]"
                aria-label={`${name}を編集`}
              >
                <Pencil size={18} />
              </button>
            </div>
          </div>

          {expandedNames[name] && (
            <div className="mt-4 space-y-5">
            <div className="flex items-center justify-between text-[#2f2a27]">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold">注意する食材</h3>
              </div>
            </div>

            {noEatItems.length > 0 ? (
              <div className="space-y-2">
                {noEatItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <div className="w-full rounded-md bg-[#f3e9e9] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-[#2f2a27]">{item.no_eat}</p>
                          {item.note && <p className="text-sm text-[#6b5a4e]">{item.note}</p>}
                        </div>
                        {!item.can_eat && (
                          <p className="shrink-0 text-sm font-medium text-red-600">食べられない</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#6b5a4e]">未登録です。</p>
            )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderCookPanel = (foodName: string) => {
    const key = canon(foodName);
    const info = key ? menuMap[key] : undefined;
    const phases: Array<{ label: string; value?: string }> = [
      { label: "離乳初期", value: info?.phase1 },
      { label: "離乳中期", value: info?.phase2 },
      { label: "離乳後期", value: info?.phase3 },
      { label: "完了期", value: info?.phase4 },
      { label: "幼児期", value: info?.phase5 },
    ];

    return (
      <div key={foodName} className="rounded-md border border-[#E6D7C8] bg-white p-4">
        <div
          role="button"
          tabIndex={0}
          onClick={() => toggleExpanded(foodName)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggleExpanded(foodName);
            }
          }}
            className="flex cursor-pointer items-center justify-between"
          >
            <div className="text-left text-lg font-bold text-[#5C3A2E]">{foodName}</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpanded(foodName);
                }}
                className="rounded p-1 text-[#8A776A]"
                aria-label={`${foodName}を${expandedNames[foodName] ? "収納" : "展開"}`}
              >
                {expandedNames[foodName] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  startInlineCookEdit(foodName);
                }}
                className="rounded p-1 text-brand hover:bg-[#F0E4D8]"
                aria-label={`${foodName}を編集`}
              >
                <Pencil size={18} />
              </button>
            </div>
          </div>

        {expandedNames[foodName] && (
          <div className="mt-4 space-y-2">
            {phases.map((phase) => (
              <div key={phase.label} className="flex items-baseline gap-3">
                <div className="w-16 shrink-0 text-sm font-bold text-[#5C3A2E]">{phase.label}</div>
                <div className="text-sm text-[#2f2a27]">
                  {phase.value?.trim() ? phase.value : "未登録"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const closeAddForm = () => {
    resetForms();
    setShowForm(false);
  };

  return (
    <main className="h-[100dvh] overflow-hidden bg-[#FFFDF8] text-[#2f2a27]">
      <Ribbon
        href="/"
        logoSrc="/yoyochi3-ribbon.png"
        alt="よちヨチ ロゴ"
        heightClass="h-20"
        bgClass="bg-[#F0E4D8]"
        logoClassName="h-[4.5rem] w-auto object-contain"
      />

      <div ref={headerRef} className="fixed inset-x-0 top-20 z-40 border-b border-[#E6D7C8] bg-[#FFFDF8] shadow-md">
        <div className="mx-auto w-full max-w-4xl px-3 pb-3 pt-3 sm:px-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
            <div className="grid grid-cols-3 gap-1 rounded-full bg-[#ece4dc] p-1 md:w-fit md:shrink-0">
              <button
                type="button"
                onClick={() => handleTabChange("cook")}
                className={`min-h-11 rounded-full py-2 text-base font-bold transition-colors duration-200 md:px-4 ${
                  activeTab === "cook"
                    ? "bg-brand text-white shadow-sm"
                    : "text-[#6b5a4e] hover:text-[#4d3f36]"
                }`}
              >
                調理方法
              </button>
              <button
                type="button"
                onClick={() => handleTabChange("child")}
                className={`min-h-11 rounded-full py-2 text-base font-bold transition-colors duration-200 md:px-4 ${
                  activeTab === "child"
                    ? "bg-brand text-white shadow-sm"
                    : "text-[#6b5a4e] hover:text-[#4d3f36]"
                }`}
              >
                園児情報
              </button>
              <button
                type="button"
                onClick={() => handleTabChange("hiyari")}
                className={`min-h-11 rounded-full py-2 text-base font-bold transition-colors duration-200 md:px-4 ${
                  activeTab === "hiyari"
                    ? "bg-brand text-white shadow-sm"
                    : "text-[#6b5a4e] hover:text-[#4d3f36]"
                }`}
              >
                ヒヤリハット
              </button>
            </div>

            <div className="flex flex-col gap-3 md:flex-1 md:flex-row md:items-center">
	          <div className="flex flex-1 gap-1">
	            <SuggestionInput
	              value={searchText}
	              onChangeValue={setSearchText}
	              options={searchBoxOptions}
	              aliasMap={activeTab === "child" ? undefined : canonicalNameMap}
	              wrapperClassName="flex-1"
	              placeholder={
	                activeTab === "cook" || activeTab === "hiyari"
	                  ? "食材名を入力してください"
	                  : "園児名を入力してください"
	              }
	              className="h-12 w-full rounded-sm border-[3px] border-brand bg-[#FFFDF8] px-3 text-base outline-none placeholder:text-[#b7aea6]"
	            />
            <button
              type="button"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-brand text-white"
              aria-label="検索"
            >
              <Search size={26} />
            </button>
          </div>

            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleAddClick}
        aria-label={primaryActionLabel}
        title={primaryActionLabel}
        className="fixed bottom-6 right-6 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-brand text-white shadow-lg transition hover:bg-brand-hover active:scale-95"
      >
        <Plus size={32} strokeWidth={2.5} />
      </button>

      <div
        className="h-full overflow-y-auto overscroll-none"
        style={{ paddingTop: headerHeight + 96 }}
      >
      <div className="mx-auto w-full max-w-4xl px-3 pb-8 sm:px-5">
        <section className="space-y-3">
          {!listLoading &&
            (activeTab === "hiyari" ? filteredAccidents.length === 0 : namesForTab.length === 0) && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <p className="text-sm text-[#6b5a4e]">表示できるデータがありません。</p>
              <button
                type="button"
                onClick={handleAddClick}
                className="text-base font-bold text-blue-600 underline underline-offset-2 hover:text-blue-700"
              >
                {activeTab === "hiyari"
                  ? "ヒヤリハットを追加する"
                  : activeTab === "cook"
                    ? "食材を追加する"
                    : "園児を追加する"}
              </button>
            </div>
          )}

          {!listLoading && activeTab !== "hiyari" &&
            namesForTab.map((name) =>
              activeTab === "child" ? renderChildPanel(name) : renderCookPanel(name)
            )}

          {!listLoading && activeTab === "hiyari" && (
            <div className="space-y-3">
              {filteredAccidents.map((item) => (
                <div
                  key={item.id}
                  className="rounded-md border border-[#E6D7C8] bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="w-full">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-bold text-[#2f2a27]">{item.food_name}</p>
                        {item.public && (
                          <span className="rounded-full bg-[#F0E4D8] px-2 py-0.5 text-xs font-semibold text-[#8A6D4E]">
                            公開
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-[#6b5a4e]">{item.accident_content}</p>
                      <p className="mt-1 text-xs text-[#8A776A]">
                        {item.child_name || "園児未設定"} / {formatDateTime(item.created_at)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => startInlineAccidentEdit(item)}
                      className="rounded p-1 text-brand hover:bg-[#F0E4D8]"
                      aria-label={`${item.food_name}のヒヤリハットを編集`}
                    >
                      <Pencil size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      </div>

      {showForm && (
        <EditModal title={primaryActionLabel} onClose={closeAddForm}>
          {activeTab === "cook" ? (
            <form onSubmit={handleCookSubmit} onKeyDownCapture={preventImeEnterSubmit} className="space-y-4">
              <label className="block text-sm font-medium text-[#2f2a27]">
                食材名
                <SuggestionInput
                  value={cookFoodName}
                  onChangeValue={setCookFoodName}
                  options={cookFoodOptions}
                  aliasMap={canonicalNameMap}
                  disableSuggestions
                  duplicateMessage="すでに登録されています。"
                  className="mt-1 h-10 w-full rounded-lg border border-[#B7A99A] bg-white px-3 text-base"
                />
              </label>

              <div className="space-y-2">
                <p className="text-sm font-medium text-[#2f2a27]">調理方法</p>
                {[
                  { key: "phase1", label: "離乳初期" },
                  { key: "phase2", label: "離乳中期" },
                  { key: "phase3", label: "離乳後期" },
                  { key: "phase4", label: "完了期" },
                  { key: "phase5", label: "幼児期" },
                ].map((row) => (
                  <div
                    key={row.key}
                    className="grid grid-cols-[4rem_1fr] items-center gap-2"
                  >
                    <div className="text-sm font-medium text-[#2f2a27]">{row.label}</div>
                    <input
                      type="text"
                      value={cookDrafts[row.key as keyof CookDrafts]}
                      onChange={(e) =>
                        setCookDrafts((prev) => ({
                          ...prev,
                          [row.key]: e.target.value,
                        }))
                      }
                      className="h-9 w-full rounded-lg border border-[#B7A99A] bg-white px-2 text-base"
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeAddForm}
                  className="h-11 rounded-lg border border-brand bg-[#FFFDF8] text-sm font-bold text-brand"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  className="h-11 rounded-lg bg-brand text-sm font-bold text-white shadow-sm disabled:opacity-70"
                >
                  {submitLoading ? "登録中" : "登録"}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleAccidentSubmit} onKeyDownCapture={preventImeEnterSubmit} className="space-y-4">
              <label className="block text-sm font-medium text-[#2f2a27]">
                園児名 (選択)
                <SuggestionInput
                  value={accidentChildName}
                  onChangeValue={setAccidentChildName}
                  options={childOptions}
                  className="mt-1 h-10 w-full rounded-lg border border-[#B7A99A] bg-white px-3 text-base"
                  unregisteredMessage="登録されている園児名を選択してください。園児情報から追加できます。"
                />
              </label>

              <label className="block text-sm font-medium text-[#2f2a27]">
                食材名 (選択)
                <SuggestionInput
                  value={accidentFood}
                  onChangeValue={setAccidentFood}
                  options={cookFoodOptions}
                  aliasMap={canonicalNameMap}
                  className="mt-1 h-10 w-full rounded-lg border border-[#B7A99A] bg-white px-3 text-base"
                  unregisteredMessage="登録されている食材名を選択してください。調理方法から追加できます。"
                />
              </label>

              <label className="block text-sm font-medium text-[#2f2a27]">
                ヒヤリハット内容
                <textarea
                  value={accidentDetail}
                  onChange={(e) => setAccidentDetail(e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-[#B7A99A] bg-white p-2 text-base"
                />
              </label>

              <label className="block">
                <span className="inline-flex items-center gap-2 text-sm text-[#2f2a27]">
                  <input
                    type="checkbox"
                    checked={accidentPublic}
                    onChange={(e) => setAccidentPublic(e.target.checked)}
                    className="h-4 w-4"
                  />
                  公開する
                </span>
                <p className="mt-1 text-xs text-[#8A776A]">
                  アプリを利用しているユーザーにヒヤリハット内容のみが共有されます。園児名は公開されません。
                </p>
              </label>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeAddForm}
                  className="h-11 rounded-lg border border-brand bg-[#FFFDF8] text-sm font-bold text-brand"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  className="h-11 rounded-lg bg-brand text-sm font-bold text-white shadow-sm disabled:opacity-70"
                >
                  {submitLoading ? "登録中" : editingAccidentId != null ? "更新" : "登録"}
                </button>
              </div>
            </form>
          )}

          {formMsg && <p className="mt-3 text-sm text-[#6b5a4e]">{formMsg}</p>}
        </EditModal>
      )}

      {foodEditTargetName && (
        <EditModal
          title={
            foodEditTargetName === NEW_CHILD_SENTINEL
              ? "園児追加"
              : `${foodEditTargetName}の情報を編集`
          }
          onClose={closeInlineEditor}
        >
          {showFoodForm ? (
            <form onSubmit={handleFoodFormSubmit} onKeyDownCapture={preventImeEnterSubmit} className="space-y-4">
              <h4 className="text-sm font-bold text-[#5C3A2E]">
                {editingAnswerId ? "注意する食材を編集" : "注意する食材を追加"}
              </h4>

              <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                <label className="text-sm font-medium text-[#2f2a27]">
                  食材名 (選択)
                  <SuggestionInput
                    value={noEat}
                    onChangeValue={setNoEat}
                    options={cookFoodOptions}
                    aliasMap={canonicalNameMap}
                    className="mt-1 h-10 w-full rounded-lg border border-[#B7A99A] bg-white px-3 text-base"
                    unregisteredMessage="登録されている食材名を入れてください。調理方法から追加できます。"
                  />
                </label>
                <label className="inline-flex h-10 items-center gap-2 text-sm font-medium text-[#2f2a27]">
                  <input
                    type="checkbox"
                    checked={isNoEatChecked}
                    onChange={(e) => setIsNoEatChecked(e.target.checked)}
                    className="h-4 w-4"
                  />
                  食べられない
                </label>
              </div>

              <label className="block text-sm font-medium text-[#2f2a27]">
                具体的な内容 (注意事項等)
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-[#B7A99A] bg-white p-2 text-base"
                />
              </label>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={backToFoodList}
                  className="h-11 rounded-lg border border-brand bg-[#FFFDF8] text-sm font-bold text-brand"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  className="h-11 rounded-lg bg-brand text-sm font-bold text-white shadow-sm disabled:opacity-70"
                >
                  {submitLoading ? "登録中" : editingAnswerId ? "食材情報を更新" : "食材を追加"}
                </button>
              </div>
              {formMsg && <p className="text-sm text-[#6b5a4e]">{formMsg}</p>}
            </form>
          ) : (
            <form
              onSubmit={
                foodEditTargetName === NEW_CHILD_SENTINEL ? handleNewChildSubmit : handleChildNameSubmit
              }
              onKeyDownCapture={preventImeEnterSubmit}
              className="space-y-4"
            >
              <h4 className="text-sm font-bold text-[#5C3A2E]">基本情報</h4>
              <label className="block text-sm font-medium text-[#2f2a27]">
                園児名
                {foodEditTargetName === NEW_CHILD_SENTINEL ? (
                  <SuggestionInput
                    value={childName}
                    onChangeValue={setChildName}
                    options={childOptions}
                    disableSuggestions
                    duplicateMessage="すでに登録されている園児です。"
                    className="mt-1 h-10 w-full rounded-lg border border-[#B7A99A] bg-white px-3 text-base"
                  />
                ) : (
                  <SuggestionInput
                    value={childName}
                    onChangeValue={setChildName}
                    options={childOptions}
                    className="mt-1 h-10 w-full rounded-lg border border-[#B7A99A] bg-white px-3 text-base"
                  />
                )}
              </label>

              <div className="border-t border-[#E6D7C8] pt-4">
                <h4 className="text-sm font-bold text-[#5C3A2E]">登録済みの食材</h4>
                {(() => {
                  const currentFoods = answerItems.filter(
                    (item) =>
                      item.child_name === foodEditTargetName && item.no_eat.trim().length > 0
                  );
                  if (currentFoods.length === 0) {
                    return <p className="mt-2 text-sm text-[#6b5a4e]">未登録です。</p>;
                  }
                  return (
                    <div className="mt-2 space-y-2">
                      {currentFoods.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 rounded-lg bg-[#f3e9e9] p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-[#2f2a27]">{item.no_eat}</p>
                            {item.note && <p className="text-sm text-[#2f2a27]">{item.note}</p>}
                            {!item.can_eat && (
                              <p className="text-sm font-medium text-[#dd3019]">食べられない</p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleStartEditFood(item)}
                              className="rounded-lg p-1.5 text-[#765B49] hover:bg-[#F0E4D8]"
                              aria-label={`${item.no_eat}を編集`}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteFood(item)}
                              className="rounded-lg p-1.5 text-[#d64a3a] hover:bg-[#f7e6e3]"
                              aria-label={`${item.no_eat}を削除`}
                            >
                              <X size={15} strokeWidth={2.5} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <button
                  type="button"
                  onClick={startAddFood}
                  disabled={!childName.trim()}
                  className="mt-3 w-full rounded-lg border border-brand bg-[#FFFDF8] py-2 text-sm font-bold text-[#765B49] hover:bg-[#F0E4D8] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#FFFDF8]"
                >
                  + 注意する食材を追加
                </button>
                {!childName.trim() && (
                  <p className="mt-1 text-xs text-[#8A776A]">園児名を入力すると食材を追加できます。</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeInlineEditor}
                  className="h-11 rounded-lg border border-brand bg-[#FFFDF8] text-sm font-bold text-brand"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  className="h-11 rounded-lg bg-brand text-sm font-bold text-white shadow-sm disabled:opacity-70"
                >
                  {submitLoading
                    ? "登録中"
                    : foodEditTargetName === NEW_CHILD_SENTINEL
                      ? "登録"
                      : "保存"}
                </button>
              </div>
              {foodEditTargetName !== NEW_CHILD_SENTINEL && (
                <button
                  type="button"
                  onClick={() => handleDeleteChildPanel(foodEditTargetName)}
                  disabled={submitLoading}
                  className="h-11 w-full rounded-lg border border-[#d64a3a] bg-white text-sm font-bold text-[#d64a3a] disabled:opacity-70"
                >
                  この園児を削除
                </button>
              )}
              {formMsg && <p className="text-sm text-[#6b5a4e]">{formMsg}</p>}
            </form>
          )}
        </EditModal>
      )}

      {cookEditTargetName && (
        <EditModal title={`${cookEditTargetName}の調理方法を編集`} onClose={cancelInlineCookEdit}>
          <form onSubmit={handleInlineCookSubmit} onKeyDownCapture={preventImeEnterSubmit} className="space-y-3">
            {[
              { key: "phase1", label: "離乳初期" },
              { key: "phase2", label: "離乳中期" },
              { key: "phase3", label: "離乳後期" },
              { key: "phase4", label: "完了期" },
              { key: "phase5", label: "幼児期" },
            ].map((phase) => (
              <div key={phase.key} className="grid grid-cols-[4rem_1fr] items-center gap-2">
                <div className="text-sm font-bold text-[#5C3A2E]">{phase.label}</div>
                <input
                  type="text"
                  value={cookDrafts[phase.key as keyof CookDrafts]}
                  onChange={(e) =>
                    setCookDrafts((prev) => ({
                      ...prev,
                      [phase.key]: e.target.value,
                    }))
                  }
                  className="h-9 w-full rounded border border-[#B7A99A] bg-white px-2 text-base"
                />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={cancelInlineCookEdit}
                className="h-11 rounded border-[3px] border-brand bg-[#FFFDF8] text-base font-bold text-brand"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={submitLoading}
                className="h-11 rounded bg-brand text-base font-bold text-white disabled:opacity-70"
              >
                {submitLoading ? "登録中" : "保存"}
              </button>
            </div>
            {formMsg && <p className="text-sm text-[#6b5a4e]">{formMsg}</p>}
          </form>
        </EditModal>
      )}

      {editingAccidentId != null && (
        <EditModal title="ヒヤリハットを編集" onClose={cancelInlineAccidentEdit}>
          <form onSubmit={handleInlineAccidentSubmit} onKeyDownCapture={preventImeEnterSubmit} className="space-y-3" aria-busy={submitLoading}>
            <label className="block text-sm font-medium text-[#2f2a27]">
              園児名 (選択)
              <SuggestionInput
                value={accidentChildName}
                onChangeValue={setAccidentChildName}
                options={childOptions}
                className="mt-1 h-10 w-full rounded border-[2px] border-[#7f7f7f] bg-white px-2"
                unregisteredMessage="登録されている園児名を選択してください。園児情報から追加できます。"
              />
            </label>
            <label className="block text-sm font-medium text-[#2f2a27]">
              食材名 (選択)
              <SuggestionInput
                value={accidentFood}
                onChangeValue={setAccidentFood}
                options={cookFoodOptions}
                aliasMap={canonicalNameMap}
                className="mt-1 h-10 w-full rounded border-[2px] border-[#7f7f7f] bg-white px-2"
                unregisteredMessage="登録されている食材名を選択してください。調理方法から追加できます。"
              />
            </label>
            <label className="block text-sm font-medium text-[#2f2a27]">
              ヒヤリハット内容
              <textarea
                value={accidentDetail}
                onChange={(e) => setAccidentDetail(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded border-[2px] border-[#7f7f7f] bg-white p-2"
              />
            </label>
            <label className="block">
              <span className="inline-flex items-center gap-2 text-sm text-[#2f2a27]">
                <input
                  type="checkbox"
                  checked={accidentPublic}
                  onChange={(e) => setAccidentPublic(e.target.checked)}
                  className="h-4 w-4"
                />
                公開する
              </span>
              <p className="mt-1 text-xs text-[#8A776A]">
                アプリを利用しているユーザーにヒヤリハット内容のみが共有されます。園児名は公開されません。
              </p>
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={cancelInlineAccidentEdit}
                className="h-10 rounded border-[2px] border-brand bg-[#FFFDF8] text-sm font-bold text-brand"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => handleDeleteAccident(editingAccidentId)}
                disabled={submitLoading}
                className="h-10 rounded border-[2px] border-red-500 bg-[#FFFDF8] text-sm font-bold text-red-600 disabled:opacity-70"
              >
                削除
              </button>
              <button
                type="submit"
                disabled={submitLoading}
                className="h-10 rounded bg-brand text-sm font-bold text-white disabled:opacity-70"
              >
                {submitLoading ? "登録中" : "保存"}
              </button>
            </div>
            {formMsg && <p className="text-sm text-[#6b5a4e]">{formMsg}</p>}
          </form>
        </EditModal>
      )}

      {listLoading && (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-white/60 backdrop-blur-[1px]"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-10 w-10 animate-spin text-brand" aria-hidden="true" />
          <span className="sr-only">読み込み中...</span>
        </div>
      )}

      {submitLoading && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-white/60 backdrop-blur-[1px]"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-10 w-10 animate-spin text-brand" aria-hidden="true" />
          <span className="sr-only">登録中...</span>
        </div>
      )}
    </main>
  );
}








