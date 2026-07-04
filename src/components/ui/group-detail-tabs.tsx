"use client";

import { useState, useRef, useEffect } from "react";
import { Avatar } from "./avatar";
import { BalanceRibbon } from "./balance-ribbon";
import { I } from "./icons";
import { formatInr, formatInrSigned, firstName } from "@/lib/format";

export type TabMember = {
  id: string;
  name: string;
  email: string;
  ownership_pct: number;
  net_in_group: number;
  role?: string | null;
};

export type TabExpense = {
  id: string;
  description: string;
  date: string;
  amount: number;
  paid_by: string;
  paid_by_name: string;
  is_settlement: boolean;
  can_edit: boolean;
  edit_href: string;
  tags?: { id: string; name: string; color: string }[];
};

export type TabTransfer = { from: string; to: string; amount: number };

type Tab = "expenses" | "members" | "balances";

type Props = {
  initial?: Tab;
  expenses: TabExpense[];
  members: TabMember[];
  transfers: TabTransfer[];
  rawTransfers: TabTransfer[];
  currentUserId: string;
  groupId: string;
};

export function GroupDetailTabs({
  initial = "expenses",
  expenses,
  members,
  transfers,
  rawTransfers,
  currentUserId,
  groupId,
}: Props) {
  const [tab, setTab] = useState<Tab>(initial);
  const [hovered, setHovered] = useState<string | null>(null);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "expenses", label: "Expenses", count: expenses.length },
    { id: "members", label: "Members", count: members.length },
    { id: "balances", label: "Balances" },
  ];

  return (
    <>
      <div
        role="tablist"
        aria-label="Group sections"
        style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--rule)", marginBottom: 16 }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 14px",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: tab === t.id ? 500 : 400,
              color: tab === t.id ? "var(--ink)" : "var(--ink-3)",
              borderBottom: "2px solid",
              borderColor: tab === t.id ? "var(--accent)" : "transparent",
              marginBottom: -1,
              transition: "all 0.15s",
            }}
          >
            {t.label}
            {typeof t.count === "number" && (
              <span className="mono" style={{ marginLeft: 6, color: "var(--ink-4)", fontSize: 11 }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "expenses" && <ExpensesTab expenses={expenses} groupId={groupId} />}
      {tab === "members" && (
        <MembersTab members={members} hovered={hovered} setHovered={setHovered} currentUserId={currentUserId} />
      )}
      {tab === "balances" && (
        <BalancesTab transfers={transfers} rawTransfers={rawTransfers} members={members} currentUserId={currentUserId} />
      )}
    </>
  );
}

function EmptyState({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ padding: "36px 20px", textAlign: "center" }}>
      <div className="serif" style={{ fontSize: 22, color: "var(--ink-2)", marginBottom: 4 }}>
        {title}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function ExpensesTab({ expenses, groupId }: { expenses: TabExpense[]; groupId: string }) {
  const [filterTags, setFilterTags]       = useState<string[]>([]);
  const [filterPaidBy, setFilterPaidBy]   = useState("");
  const [filterDesc, setFilterDesc]       = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo]   = useState("");
  const [filtersOpen, setFiltersOpen]     = useState(false);
  const [exportOpen, setExportOpen]       = useState(false);
  const panelRef  = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  // Derive unique tags and payers from the full expense list.
  const allTags = [...new Map(
    expenses.flatMap((e) => e.tags ?? []).map((t) => [t.id, t])
  ).values()].sort((a, b) => a.name.localeCompare(b.name));

  const allPayers = [...new Map(
    expenses.map((e) => [e.paid_by, e.paid_by_name])
  ).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Apply all active filters.
  const filtered = expenses.filter((e) => {
    if (filterTags.length > 0) {
      const expTagIds = (e.tags ?? []).map((t) => t.id);
      if (!filterTags.some((tid) => expTagIds.includes(tid))) return false;
    }
    if (filterPaidBy && e.paid_by !== filterPaidBy) return false;
    if (filterDesc && !e.description.toLowerCase().includes(filterDesc.toLowerCase())) return false;
    if (filterDateFrom && e.date < filterDateFrom) return false;
    if (filterDateTo && e.date > filterDateTo) return false;
    return true;
  });

  const activeCount =
    (filterTags.length > 0 ? 1 : 0) +
    (filterPaidBy ? 1 : 0) +
    (filterDesc ? 1 : 0) +
    (filterDateFrom || filterDateTo ? 1 : 0);
  const isFiltered = activeCount > 0;

  function clearFilters() {
    setFilterTags([]);
    setFilterPaidBy("");
    setFilterDesc("");
    setFilterDateFrom("");
    setFilterDateTo("");
  }

  function toggleTag(id: string) {
    setFilterTags((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);
  }

  // Build the ids query param when filters are active.
  const idsParam = isFiltered ? `&ids=${filtered.map((e) => e.id).join(",")}` : "";

  // Close filter panel on outside click.
  useEffect(() => {
    if (!filtersOpen) return;
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setFiltersOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [filtersOpen]);

  // Close export dropdown on outside click.
  useEffect(() => {
    if (!exportOpen) return;
    function handle(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [exportOpen]);

  return (
    <div>
      {/* ── Filter controls ───────────────────────────────── */}
      <div ref={panelRef} style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: filtersOpen ? 10 : 0 }}>
          {/* Filter toggle */}
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              borderRadius: 8,
              border: "1px solid",
              borderColor: isFiltered ? "var(--accent)" : "var(--rule, #1a1a20)",
              background: isFiltered
                ? "color-mix(in oklch, var(--accent) 10%, transparent)"
                : "transparent",
              color: isFiltered ? "var(--accent)" : "var(--ink-2)",
              fontSize: 12,
              fontWeight: 450,
              cursor: "pointer",
            }}
          >
            <I.filter size={12} />
            Filter
            {activeCount > 0 && (
              <span style={{
                background: "var(--accent)",
                color: "#000",
                borderRadius: 999,
                padding: "1px 6px",
                fontSize: 10,
                fontWeight: 700,
                lineHeight: 1.4,
              }}>
                {activeCount}
              </span>
            )}
          </button>

          {/* Export dropdown */}
          <div ref={exportRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setExportOpen((v) => !v)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px",
                borderRadius: 8,
                border: "1px solid var(--rule, #1a1a20)",
                background: "transparent",
                color: "var(--ink-2)",
                fontSize: 12,
                fontWeight: 450,
                cursor: "pointer",
              }}
            >
              <I.download size={11} />
              Export{isFiltered ? ` (${filtered.length})` : ""}
              <I.chevronD size={10} />
            </button>

            {exportOpen && (
              <div
                role="menu"
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  zIndex: 50,
                  minWidth: 130,
                  borderRadius: 10,
                  border: "1px solid var(--rule-strong, #1c1c22)",
                  background: "var(--card, #111114)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                  overflow: "hidden",
                  padding: "4px 0",
                }}
              >
                {(["json", "csv", "xlsx", "pdf"] as const).map((fmt) => (
                  <a
                    key={fmt}
                    role="menuitem"
                    href={`/api/groups/${groupId}/export?format=${fmt}${idsParam}`}
                    download
                    onClick={() => setExportOpen(false)}
                    style={{
                      display: "block",
                      padding: "8px 14px",
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--ink)",
                      textDecoration: "none",
                      textTransform: "uppercase",
                      fontFamily: "var(--font-mono)",
                      letterSpacing: "0.06em",
                    }}
                    className="export-fmt-option"
                  >
                    {fmt === "xlsx" ? "Excel" : fmt.toUpperCase()}
                  </a>
                ))}
              </div>
            )}
          </div>

          {isFiltered && (
            <>
              <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                {filtered.length} of {expenses.length}
              </span>
              <span style={{ width: 2, height: 2, borderRadius: "50%", background: "var(--ink-4)", flexShrink: 0 }} />
              <span className="mono tnum" style={{ fontSize: 11, color: "var(--ink-2)", fontWeight: 500 }}>
                {formatInr(filtered.filter((e) => !e.is_settlement).reduce((sum, e) => sum + e.amount, 0))}
              </span>
              <button
                type="button"
                onClick={clearFilters}
                style={{
                  fontSize: 11,
                  color: "var(--ink-3)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  textDecoration: "underline",
                  padding: 0,
                }}
              >
                Clear
              </button>
            </>
          )}
        </div>

        {filtersOpen && (
          <div style={{
            padding: "14px 16px",
            borderRadius: 12,
            border: "1px solid var(--rule-strong, #1c1c22)",
            background: "var(--card, #111114)",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}>
            {/* Tags */}
            {allTags.length > 0 && (
              <div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Tags</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {allTags.map((t) => {
                    const active = filterTags.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTag(t.id)}
                        style={{
                          padding: "3px 10px",
                          borderRadius: 999,
                          border: `1px solid ${active ? t.color : t.color + "55"}`,
                          background: active ? t.color + "33" : t.color + "11",
                          color: t.color,
                          fontSize: 12,
                          fontWeight: active ? 600 : 400,
                          cursor: "pointer",
                          transition: "all 0.12s",
                        }}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Paid by · Description · From · To */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 10,
            }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>Paid by</div>
                <select
                  value={filterPaidBy}
                  onChange={(e) => setFilterPaidBy(e.target.value)}
                  className="input-warm"
                  style={{ fontSize: 13, padding: "6px 10px", width: "100%" }}
                >
                  <option value="">All members</option>
                  {allPayers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>Description</div>
                <input
                  type="text"
                  value={filterDesc}
                  onChange={(e) => setFilterDesc(e.target.value)}
                  placeholder="Contains…"
                  className="input-warm"
                  style={{ fontSize: 13, padding: "6px 10px", width: "100%" }}
                />
              </div>

              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>From</div>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="input-warm"
                  style={{ fontSize: 13, padding: "6px 10px", width: "100%" }}
                />
              </div>

              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>To</div>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="input-warm"
                  style={{ fontSize: 13, padding: "6px 10px", width: "100%" }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Expense list ──────────────────────────────────── */}
      <div className="card" style={{ overflow: "hidden", padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState
            title={isFiltered ? "No matching expenses" : "No expenses yet"}
            sub={isFiltered ? "Try adjusting your filters." : "When someone adds one, it'll appear here."}
          />
        ) : (
          filtered.map((e, i) => {
            const day = new Date(e.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
            return (
              <div
                key={e.id}
                style={{
                  padding: "16px 18px",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  borderBottom: i === filtered.length - 1 ? "none" : "1px solid var(--rule-2)",
                  background: e.is_settlement
                    ? "color-mix(in oklch, var(--accent) 4%, transparent)"
                    : "transparent",
                }}
              >
                <Avatar name={e.paid_by_name} id={e.paid_by} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div
                      style={{
                        fontSize: 14.5,
                        fontWeight: 450,
                        color: "var(--ink)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        letterSpacing: "-0.005em",
                      }}
                    >
                      {e.description}
                    </div>
                    {e.is_settlement && (
                      <span style={{
                        flexShrink: 0,
                        fontSize: 9,
                        fontFamily: "var(--font-mono)",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        padding: "2px 6px",
                        borderRadius: 999,
                        background: "color-mix(in oklch, var(--accent) 15%, transparent)",
                        color: "var(--accent)",
                        border: "1px solid color-mix(in oklch, var(--accent) 30%, transparent)",
                      }}>
                        Settlement
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--ink-3)",
                      marginTop: 3,
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <span>{firstName(e.paid_by_name)} paid</span>
                    <span style={{ width: 2, height: 2, borderRadius: "50%", background: "var(--ink-4)" }} />
                    <span className="mono">{day}</span>
                  </div>
                  {!e.is_settlement && e.tags && e.tags.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                      {e.tags.map((t) => (
                        <span
                          key={t.id}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "2px 7px",
                            borderRadius: 999,
                            background: t.color + "22",
                            border: `1px solid ${t.color}55`,
                            color: t.color,
                            fontSize: 10.5,
                            fontWeight: 500,
                            letterSpacing: "-0.01em",
                          }}
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div
                  className="serif tnum"
                  style={{
                    fontSize: 20,
                    color: e.is_settlement ? "var(--accent)" : "var(--ink)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {formatInr(e.amount)}
                </div>
                {e.can_edit && (
                  <a
                    href={e.edit_href}
                    className="mono"
                    style={{
                      fontSize: 11,
                      color: "var(--ink-3)",
                      textDecoration: "none",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      padding: "6px 8px",
                    }}
                  >
                    Edit
                  </a>
                )}
              </div>
            );
          })
        )}
        <div style={{ borderTop: "1px solid var(--rule-2)", padding: "10px 14px", textAlign: "right" }}>
          <a
            href={`/groups/${groupId}/expenses/new`}
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--accent)",
              textDecoration: "none",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            + Add expense
          </a>
        </div>
      </div>
      <style>{`.export-fmt-option:hover { background: var(--surface-warm, #0c0c0f); }`}</style>
    </div>
  );
}

function MembersTab({
  members,
  hovered,
  setHovered,
  currentUserId,
}: {
  members: TabMember[];
  hovered: string | null;
  setHovered: (id: string | null) => void;
  currentUserId: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
      }}
    >
      {members.map((m, i) => (
        <div
          key={m.id}
          onMouseEnter={() => setHovered(m.id)}
          onMouseLeave={() => setHovered(null)}
          className="rise"
          style={{
            animationDelay: `${i * 40}ms`,
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: 14,
            borderRadius: 12,
            background: "var(--card)",
            border: "1px solid var(--rule)",
            outline: hovered === m.id ? "2px solid var(--accent)" : "none",
            outlineOffset: "-1px",
            transition: "outline 0.15s",
          }}
        >
          <Avatar name={m.name} id={m.id} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>
              {m.name}
              {m.id === currentUserId && (
                <span className="badge badge-muted" style={{ marginLeft: 8, fontSize: 9 }}>
                  YOU
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{m.email}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="mono tnum" style={{ fontSize: 18, fontWeight: 500, color: "var(--ink)" }}>
              {m.ownership_pct}%
            </div>
            <div className="eyebrow">ownership</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function BalancesTab({
  transfers,
  rawTransfers,
  members,
  currentUserId,
}: {
  transfers: TabTransfer[];
  rawTransfers: TabTransfer[];
  members: TabMember[];
  currentUserId: string;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<"minimized" | "actual">("minimized");
  const memberById = new Map(members.map((m) => [m.id, m]));

  const active = mode === "minimized" ? transfers : rawTransfers;

  return (
    <div
      style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(260px, 320px) 1fr" }}
      className="balances-grid"
    >
      {/* Left: ribbon diagram */}
      <div
        style={{
          padding: 20,
          borderRadius: 16,
          background: "var(--card)",
          border: "1px solid var(--rule)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div className="eyebrow">Who owes whom</div>
        {active.length > 0 ? (
          <BalanceRibbon
            transfers={active}
            members={members.map((m) => ({ id: m.id, name: m.name }))}
            size={260}
            highlightId={sel}
          />
        ) : (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div className="serif" style={{ fontSize: 22, color: "var(--ink-2)", marginBottom: 4 }}>
              All square
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
              No transfers needed.
            </div>
          </div>
        )}
        {active.length > 0 && (
          <div style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
            {active.length} {mode === "minimized" ? "simplified" : "actual"} transfer{active.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Right: settlement plan */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div
          style={{
            padding: "12px 18px",
            borderBottom: "1px solid var(--rule-2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span className="eyebrow">Settlement plan</span>

          {/* Mode toggle pill */}
          <div
            style={{
              display: "flex",
              gap: 2,
              padding: 3,
              borderRadius: 999,
              background: "var(--surface-2)",
              border: "1px solid var(--rule)",
            }}
          >
            {(["minimized", "actual"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={{
                  padding: "3px 10px",
                  borderRadius: 999,
                  border: "none",
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  cursor: "pointer",
                  fontWeight: mode === m ? 600 : 400,
                  background: mode === m ? "var(--accent)" : "transparent",
                  color: mode === m ? "#000" : "var(--ink-3)",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Explanation for actual mode */}
        {mode === "actual" && active.length > 0 && (
          <div
            style={{
              padding: "8px 18px",
              borderBottom: "1px solid var(--rule-2)",
              fontSize: 11,
              color: "var(--ink-3)",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.04em",
            }}
          >
            Raw pairwise balances — more transfers, same total money moved.
          </div>
        )}

        {active.length === 0 ? (
          <EmptyState title="All square" sub="No transfers needed." />
        ) : (
          active.map((t, i) => {
            const from = memberById.get(t.from);
            const to = memberById.get(t.to);
            if (!from || !to) return null;
            const involvesMe = t.from === currentUserId || t.to === currentUserId;
            const signed = t.from === currentUserId ? -t.amount : t.to === currentUserId ? t.amount : 0;
            return (
              <div
                key={i}
                onMouseEnter={() => setSel(from.id)}
                onMouseLeave={() => setSel(null)}
                style={{
                  padding: "14px 18px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  borderBottom: i === active.length - 1 ? "none" : "1px solid var(--rule-2)",
                  background: involvesMe
                    ? "color-mix(in oklch, var(--accent-wash) 60%, transparent)"
                    : "transparent",
                }}
              >
                <Avatar name={from.name} id={from.id} size={28} />
                <span style={{ fontSize: 13, color: "var(--ink-2)" }}>{firstName(from.name)}</span>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4, color: "var(--ink-4)" }}>
                  <div style={{ flex: 1, height: 1, background: "var(--rule)" }} />
                  <span className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    pays
                  </span>
                  <div style={{ flex: 1, height: 1, background: "var(--rule)" }} />
                  <I.arrow size={14} stroke="var(--accent)" />
                </div>
                <span style={{ fontSize: 13, color: "var(--ink-2)" }}>{firstName(to.name)}</span>
                <Avatar name={to.name} id={to.id} size={28} />
                <div
                  className="mono tnum"
                  style={{
                    fontSize: 15,
                    fontWeight: 500,
                    color: involvesMe ? (signed >= 0 ? "var(--pos)" : "var(--neg)") : "var(--ink)",
                    minWidth: 90,
                    textAlign: "right",
                  }}
                >
                  {involvesMe ? formatInrSigned(signed) : formatInr(t.amount)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
