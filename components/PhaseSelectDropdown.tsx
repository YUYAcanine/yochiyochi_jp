"use client";

import React from "react";
import { ChevronDown } from "lucide-react";
import { PHASE_AGE_LABELS } from "@/components/checklist";
import type { PhaseKey } from "@/types/food";

type Props = {
  phase: PhaseKey;
  onChangePhase: (phase: PhaseKey) => void;
  labels: Record<PhaseKey, string>;
  className?: string;
};

export default function PhaseSelectDropdown({
  phase,
  onChangePhase,
  labels,
  className = "",
}: Props) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  const keys = React.useMemo(() => Object.keys(labels) as PhaseKey[], [labels]);

  React.useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEsc);
    };
  }, []);

  const handleSelect = (key: PhaseKey) => {
    onChangePhase(key);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={className}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex h-10 min-w-[170px] items-center justify-between gap-2 whitespace-nowrap rounded-lg border-2 border-brand bg-[#FBF3EC] px-3 text-sm font-semibold text-[#2F2A27] shadow-sm outline-none sm:min-w-[190px] sm:text-base"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="時期を選択"
        >
          <span>{labels[phase]}</span>
          <ChevronDown
            strokeWidth={3}
            className={`h-4 w-4 shrink-0 text-brand transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open && (
          <ul
            role="listbox"
            aria-label="時期の選択肢"
            className="absolute left-0 z-50 mt-1 w-max min-w-full overflow-hidden rounded-lg border-2 border-brand bg-white shadow-md"
          >
            {keys.map((key) => {
              const selected = key === phase;
              return (
                <li key={key} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => handleSelect(key)}
                    className={`flex w-full items-baseline gap-2 whitespace-nowrap px-3 py-2 text-left text-sm ${
                      selected
                        ? "bg-[#F0E4D8] font-semibold text-[#2F2A27]"
                        : "text-[#2F2A27] hover:bg-[#F8F3EE]"
                    }`}
                  >
                    {labels[key]}
                    <span className="text-xs font-medium text-[#8A776A]">{PHASE_AGE_LABELS[key]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
