"use client";

import { formatInr } from "@/lib/format";

export type TagStat = {
  id: string;
  name: string;
  color: string;
  total: number;
  count: number;
};

type Props = {
  stats: TagStat[];
  /** Grand total across all tags (for percentage bars). If omitted, uses sum of stats. */
  grandTotal?: number;
};

/**
 * Horizontal bar chart showing expense spend per tag.
 * Expenses with no tags are shown under "Uncategorized" if the caller includes them.
 */
export function TagBreakdown({ stats, grandTotal }: Props) {
  const total = grandTotal ?? stats.reduce((s, t) => s + t.total, 0);
  if (stats.length === 0 || total === 0) return null;

  const sorted = [...stats].sort((a, b) => b.total - a.total);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {sorted.map((tag) => {
        const pct = total > 0 ? (tag.total / total) * 100 : 0;
        const isUncategorized = tag.id === "__none__";
        return (
          <div key={tag.id} style={{ display: "grid", gridTemplateColumns: "140px 1fr 90px", gap: 10, alignItems: "center" }}>
            {/* Label */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: isUncategorized ? "var(--ink-4)" : tag.color,
                  border: isUncategorized ? "1px dashed var(--ink-4)" : "none",
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  color: isUncategorized ? "var(--ink-3)" : "var(--ink-2)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  fontStyle: isUncategorized ? "italic" : "normal",
                }}
              >
                {tag.name}
              </span>
              <span
                className="mono"
                style={{ fontSize: 10, color: "var(--ink-4)", flexShrink: 0 }}
              >
                {tag.count}
              </span>
            </div>

            {/* Bar */}
            <div
              style={{
                height: 6,
                borderRadius: 999,
                background: "var(--surface-2)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  borderRadius: 999,
                  background: isUncategorized ? "var(--ink-4)" : tag.color,
                  transition: "width 0.4s ease",
                  opacity: isUncategorized ? 0.5 : 0.85,
                }}
              />
            </div>

            {/* Amount */}
            <div style={{ textAlign: "right" }}>
              <span
                className="mono tnum"
                style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)" }}
              >
                {formatInr(tag.total)}
              </span>
              <span
                className="mono"
                style={{ fontSize: 10, color: "var(--ink-4)", marginLeft: 4 }}
              >
                {Math.round(pct)}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Build TagStat[] from a list of expenses that carry tag arrays. */
export function buildTagStats(
  expenses: { amount: number; is_settlement?: boolean; tags?: { id: string; name: string; color: string }[] }[],
): TagStat[] {
  const map = new Map<string, TagStat>();

  for (const e of expenses) {
    if (e.is_settlement) continue;
    const amt = Number(e.amount);
    const tags = e.tags ?? [];

    if (tags.length === 0) {
      const cur = map.get("__none__") ?? { id: "__none__", name: "Uncategorized", color: "#666", total: 0, count: 0 };
      cur.total += amt;
      cur.count += 1;
      map.set("__none__", cur);
    } else {
      for (const t of tags) {
        const cur = map.get(t.id) ?? { id: t.id, name: t.name, color: t.color, total: 0, count: 0 };
        cur.total += amt;
        cur.count += 1;
        map.set(t.id, cur);
      }
    }
  }

  return Array.from(map.values());
}
