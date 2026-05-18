"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { I } from "@/components/ui/icons";
import type { RangePresetId, ReportRange } from "./report-data";

type Props = {
  range: ReportRange;
  presetId: RangePresetId | null;
};

const PRESETS: { id: RangePresetId; label: string }[] = [
  { id: "this-week", label: "This week" },
  { id: "last-week", label: "Last week" },
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "this-quarter", label: "This quarter" },
  { id: "ytd", label: "YTD" },
];

export function ReportToolbar({ range, presetId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const isCustom = !presetId || presetId === "custom";
  const [start, setStart] = useState(range.start);
  const [end, setEnd] = useState(range.end);

  // Auto-print when ?print=1 is in the URL (e.g. the "Download" CTA on
  // the dashboard). We wait on `document.fonts.ready` so the PDF
  // doesn't capture a fallback-font frame, and we strip the flag from
  // the URL AFTER firing so a refresh doesn't loop the dialog open.
  // Doing the work inside `fonts.ready` (instead of a setTimeout) also
  // sidesteps a cleanup race: if we navigate first, the effect re-runs
  // and clearTimeout cancels the pending print before it fires.
  const autoPrintFired = useRef(false);
  useEffect(() => {
    if (autoPrintFired.current) return;
    if (searchParams.get("print") !== "1") return;
    autoPrintFired.current = true;
    const fire = () => {
      if (typeof window === "undefined") return;
      window.print();
      const cleaned = new URLSearchParams(searchParams.toString());
      cleaned.delete("print");
      const qs = cleaned.toString();
      router.replace(`/reports${qs ? `?${qs}` : ""}`, { scroll: false });
    };
    const ready = typeof document !== "undefined" ? document.fonts?.ready : null;
    if (ready && typeof ready.then === "function") {
      ready.then(fire).catch(fire);
    } else {
      fire();
    }
  }, [router, searchParams]);

  function navigateWith(params: URLSearchParams) {
    startTransition(() => {
      router.replace(`/reports?${params.toString()}`, { scroll: false });
    });
  }

  function pickPreset(id: RangePresetId) {
    const next = new URLSearchParams();
    next.set("preset", id);
    navigateWith(next);
  }

  function pickKind(kind: "monthly" | "adhoc") {
    if (kind === "monthly") {
      pickPreset("last-month");
    } else {
      pickPreset("this-month");
    }
  }

  function applyCustom() {
    if (!start || !end) return;
    const next = new URLSearchParams();
    next.set("start", start);
    next.set("end", end);
    navigateWith(next);
  }

  function openCustomMode() {
    // Switch to custom inputs but keep current range visible until the
    // user clicks Apply. We don't fire a navigation here.
    const next = new URLSearchParams(searchParams.toString());
    next.set("preset", "custom");
    next.set("start", start);
    next.set("end", end);
    navigateWith(next);
  }

  function onPrint() {
    if (typeof window !== "undefined") window.print();
  }

  const kind = range.kind;

  return (
    <div className="report-toolbar" data-print-hide>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--accent)",
            animation: "pulse 2s ease infinite",
          }}
        />
        <span
          className="mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
          }}
        >
          Reports · {range.label}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {/* Monthly / Ad-hoc */}
        <div
          style={{
            display: "inline-flex",
            gap: 3,
            padding: 3,
            borderRadius: 9,
            background: "var(--card)",
            border: "1px solid var(--rule)",
          }}
        >
          <SegButton on={kind === "monthly"} onClick={() => pickKind("monthly")}>
            Monthly
          </SegButton>
          <SegButton on={kind === "adhoc"} onClick={() => pickKind("adhoc")}>
            Ad-hoc
          </SegButton>
        </div>

        {/* Preset select — only visible for ad-hoc */}
        {kind === "adhoc" && (
          <select
            value={isCustom ? "custom" : presetId ?? "this-month"}
            onChange={(e) => {
              const v = e.target.value as RangePresetId | "custom";
              if (v === "custom") openCustomMode();
              else pickPreset(v as RangePresetId);
            }}
            disabled={pending}
            className="mono"
            style={pillSelectStyle}
            aria-label="Date range preset"
          >
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom range…</option>
          </select>
        )}

        {/* Custom date pickers — only visible when the user picked custom */}
        {kind === "adhoc" && isCustom && (
          <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              max={end}
              className="mono"
              style={dateInputStyle}
              aria-label="Range start"
            />
            <span style={{ color: "var(--ink-4)", fontSize: 11 }}>→</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              min={start}
              className="mono"
              style={dateInputStyle}
              aria-label="Range end"
            />
            <button
              type="button"
              onClick={applyCustom}
              disabled={pending || !start || !end}
              className="btn btn-ghost"
              style={{ height: 34, padding: "0 12px", fontSize: 12 }}
            >
              Apply
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onPrint}
          className="btn btn-accent shimmer"
          style={{ height: 34, padding: "0 14px", fontSize: 12.5 }}
        >
          <I.arrowDown size={13} /> Save as PDF
        </button>
      </div>
    </div>
  );
}

function SegButton({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 12px",
        borderRadius: 6,
        border: "none",
        cursor: "pointer",
        background: on ? "var(--ink)" : "transparent",
        color: on ? "var(--bg)" : "var(--ink-3)",
        fontFamily: "var(--font-sans)",
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: "-0.005em",
        transition: "all 0.15s",
      }}
    >
      {children}
    </button>
  );
}

const pillSelectStyle: React.CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  height: 34,
  padding: "0 28px 0 12px",
  borderRadius: 8,
  background: "var(--card)",
  border: "1px solid var(--rule)",
  color: "var(--ink-2)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round'><path d='M6 9l6 6 6-6'/></svg>")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 8px center",
};

const dateInputStyle: React.CSSProperties = {
  height: 34,
  padding: "0 10px",
  borderRadius: 8,
  background: "var(--card)",
  border: "1px solid var(--rule)",
  color: "var(--ink-2)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  fontWeight: 500,
  minWidth: 130,
};
