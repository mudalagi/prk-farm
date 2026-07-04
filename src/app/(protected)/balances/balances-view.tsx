"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { BalanceRibbon } from "@/components/ui/balance-ribbon";
import { I } from "@/components/ui/icons";
import { formatInr } from "@/lib/format";

export type Settlement = {
  id: string;
  name: string;
  net: number; // positive = they owe you; negative = you owe them
  groups: string[];
};

export type LedgerRow = {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
  groupName: string;
};

export type RibbonMember = { id: string; name: string };

type Props = {
  tenantName: string;
  net: number;
  settlements: Settlement[];
  ledger: LedgerRow[];
  rawLedger: LedgerRow[];
  ribbonMembers: RibbonMember[];
  groupCount: number;
};

export function BalancesView({ tenantName, net, settlements, ledger, rawLedger, ribbonMembers, groupCount }: Props) {
  const [showNetwork, setShowNetwork] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [ledgerMode, setLedgerMode] = useState<"simplified" | "actual">("simplified");
  const activeLedger = ledgerMode === "simplified" ? ledger : rawLedger;

  return (
    <div
      className="mx-auto"
      style={{ maxWidth: 1120, padding: "clamp(20px, 3vw, 32px) clamp(20px, 4vw, 40px) 56px" }}
    >
      <style>{`
        .ledger-grid {
          display: grid;
          grid-template-columns: 28px minmax(0, 1fr) 14px 28px minmax(0, 1fr) 100px;
          column-gap: 10px;
          align-items: center;
        }
        .ledger-grid .lr-group { display: none; }
        .ledger-row:hover { background: var(--surface-2); }
        @media (min-width: 768px) {
          .ledger-grid {
            grid-template-columns: 28px minmax(90px, 1fr) 16px 28px minmax(90px, 1fr) minmax(140px, 1.4fr) 130px;
            column-gap: 12px;
          }
          .ledger-grid .lr-group { display: inline; }
        }
      `}</style>
      {/* Hero */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Tenant · {tenantName}
          </div>
          <h1
            className="serif"
            style={{
              fontSize: "clamp(34px, 6vw, 48px)",
              margin: 0,
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            Balances
          </h1>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <span
              className="serif tnum"
              style={{
                fontSize: "clamp(28px, 4vw, 36px)",
                letterSpacing: "-0.02em",
                color: net === 0 ? "var(--ink-2)" : net > 0 ? "var(--pos)" : "var(--neg)",
              }}
            >
              {net > 0 ? "+" : net < 0 ? "−" : ""}
              {formatInr(Math.abs(net))}
            </span>
            <span className="eyebrow" style={{ color: "var(--ink-3)" }}>
              your net position
            </span>
          </div>
        </div>
        {settlements.length > 0 && (
          <button
            type="button"
            onClick={() => setShowNetwork((v) => !v)}
            className="btn btn-ghost"
            style={{ fontSize: 12 }}
          >
            {showNetwork ? "Hide" : "View"} network <I.arrow size={12} />
          </button>
        )}
      </div>

      {/* Primary: Settle up */}
      <section style={{ marginBottom: 28 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 14,
            gap: 12,
          }}
        >
          <h2 className="serif" style={{ fontSize: "clamp(22px, 3vw, 26px)", margin: 0, letterSpacing: "-0.015em" }}>
            Settle up
          </h2>
          {settlements.length > 0 && (
            <span className="eyebrow hidden md:inline" style={{ color: "var(--ink-4)" }}>
              {settlements.length} {settlements.length === 1 ? "person" : "people"}
            </span>
          )}
        </div>

        {settlements.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: "center" }}>
            <div className="serif" style={{ fontSize: 22, color: "var(--ink-2)", marginBottom: 4 }}>
              All square
            </div>
            <div className="eyebrow" style={{ color: "var(--ink-3)" }}>
              No balances to settle.
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {settlements.map((s, i) => {
              const owesYou = s.net > 0;
              return (
                <SettlementRow
                  key={s.id}
                  s={s}
                  owesYou={owesYou}
                  i={i}
                  onHover={setHoverId}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Optional network view */}
      {showNetwork && settlements.length > 0 && (
        <div
          className="rise card"
          style={{
            padding: "clamp(18px, 3vw, 24px)",
            borderRadius: 16,
            marginBottom: 28,
            display: "flex",
            flexWrap: "wrap",
            gap: 24,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <BalanceRibbon
            transfers={activeLedger}
            members={ribbonMembers}
            size={280}
            highlightId={hoverId}
          />
          <div style={{ maxWidth: 280 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Network view
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink-2)", margin: 0 }}>
              Threads show money flowing between people across all groups. Thicker threads are larger balances.
              Hover a row above or below to trace that person.
            </p>
          </div>
        </div>
      )}

      {/* Secondary: full ledger, collapsible */}
      {(ledger.length > 0 || rawLedger.length > 0) && (
        <details style={{ marginTop: 8 }}>
          <summary
            style={{
              cursor: "pointer",
              listStyle: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 0",
              borderTop: "1px solid var(--rule)",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flex: 1 }}>
              <h2 className="serif" style={{ fontSize: 22, margin: 0, letterSpacing: "-0.015em" }}>
                Full ledger
              </h2>
              <span className="eyebrow" style={{ color: "var(--ink-4)" }}>
                {activeLedger.length} {ledgerMode === "simplified" ? "simplified" : "actual"} transfer{activeLedger.length !== 1 ? "s" : ""} across {groupCount} {groupCount === 1 ? "group" : "groups"}
              </span>
            </div>
            {/* Mode toggle — stop click from collapsing the details */}
            <div
              onClick={(e) => e.preventDefault()}
              style={{
                display: "flex",
                gap: 2,
                padding: 3,
                borderRadius: 999,
                background: "var(--surface-2)",
                border: "1px solid var(--rule)",
              }}
            >
              {(["simplified", "actual"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={(e) => { e.preventDefault(); setLedgerMode(m); }}
                  style={{
                    padding: "3px 10px",
                    borderRadius: 999,
                    border: "none",
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    cursor: "pointer",
                    fontWeight: ledgerMode === m ? 600 : 400,
                    background: ledgerMode === m ? "var(--accent)" : "transparent",
                    color: ledgerMode === m ? "#000" : "var(--ink-3)",
                    transition: "background 0.15s, color 0.15s",
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
            <span className="eyebrow" style={{ color: "var(--ink-3)", flexShrink: 0 }}>
              expand <I.chevronD size={10} />
            </span>
          </summary>
          {ledgerMode === "actual" && activeLedger.length > 0 && (
            <div
              style={{
                padding: "8px 14px",
                marginTop: 8,
                borderRadius: 8,
                background: "var(--surface-2)",
                fontSize: 11,
                color: "var(--ink-3)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.04em",
              }}
            >
              Raw pairwise balances — more transfers, same total money moved.
            </div>
          )}
          <div
            className="card"
            style={{ borderRadius: 12, overflow: "hidden", marginTop: 12, padding: 0 }}
          >
            <LedgerHeader />
            {activeLedger.map((t, i) => (
              <LedgerRowItem
                key={`${t.from}-${t.to}-${t.groupName}-${i}`}
                t={t}
                isLast={i === activeLedger.length - 1}
                onHover={setHoverId}
              />
            ))}
          </div>
        </details>
      )}

      {settlements.length === 0 && ledger.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: "center", marginTop: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Nothing yet
          </div>
          <p style={{ color: "var(--ink-3)", fontSize: 13, margin: "0 0 20px" }}>
            Balances appear once there are expenses in the tenant.
          </p>
          <Link href="/groups" className="btn btn-ghost">
            Go to groups
          </Link>
        </div>
      )}
    </div>
  );
}

function SettlementRow({
  s,
  owesYou,
  i,
  onHover,
}: {
  s: Settlement;
  owesYou: boolean;
  i: number;
  onHover: (id: string | null) => void;
}) {
  return (
    <div
      className="rise"
      onMouseEnter={() => onHover(s.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        padding: "clamp(14px, 2vw, 18px)",
        borderRadius: 14,
        background: "var(--card)",
        border: "1px solid var(--rule)",
        display: "grid",
        gridTemplateColumns: "48px 1fr auto",
        columnGap: 14,
        alignItems: "center",
        transition: "border-color 0.18s, background 0.18s",
        animationDelay: `${i * 40}ms`,
      }}
    >
      <Avatar id={s.id} name={s.name} size={44} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: "var(--ink)", marginBottom: 2 }}>{s.name}</div>
        <div
          className="mono"
          style={{
            fontSize: 11,
            color: "var(--ink-3)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {s.groups.join(" · ")}
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto auto",
          gap: 16,
          alignItems: "center",
        }}
      >
        <div style={{ textAlign: "right" }}>
          <div
            className="mono"
            style={{
              fontSize: 10,
              color: "var(--ink-4)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 2,
            }}
          >
            {owesYou ? "They owe you" : "You owe them"}
          </div>
          <div
            className="mono tnum"
            style={{
              fontSize: 16,
              fontWeight: 500,
              color: owesYou ? "var(--pos)" : "var(--neg)",
            }}
          >
            {formatInr(Math.abs(s.net))}
          </div>
        </div>
        <button
          type="button"
          className="btn hidden md:inline-flex"
          style={{
            height: 36,
            padding: "0 14px",
            fontSize: 12,
            background: owesYou ? "var(--accent)" : "var(--card)",
            color: owesYou ? "var(--accent-ink)" : "var(--ink)",
            border: owesYou ? "none" : "1px solid var(--rule)",
            boxShadow: owesYou ? "var(--shadow-sm)" : "none",
          }}
          aria-label={owesYou ? `Remind ${s.name}` : `Settle up with ${s.name}`}
        >
          {owesYou ? "Remind" : "Settle up"} <I.arrow size={12} />
        </button>
      </div>
    </div>
  );
}

function LedgerHeader() {
  return (
    <div
      className="ledger-grid"
      style={{
        padding: "10px 18px",
        background: "var(--surface-2)",
        borderBottom: "1px solid var(--rule)",
        fontSize: 10,
        color: "var(--ink-3)",
        fontFamily: "var(--font-mono)",
        textTransform: "uppercase",
        letterSpacing: "0.12em",
      }}
    >
      <span />
      <span>From</span>
      <span />
      <span />
      <span>To</span>
      <span className="lr-group">Group</span>
      <span style={{ textAlign: "right" }}>Amount</span>
    </div>
  );
}

function LedgerRowItem({
  t,
  isLast,
  onHover,
}: {
  t: LedgerRow;
  isLast: boolean;
  onHover: (id: string | null) => void;
}) {
  return (
    <button
      type="button"
      onMouseEnter={() => onHover(t.from)}
      onMouseLeave={() => onHover(null)}
      className="ledger-row ledger-grid"
      style={{
        width: "100%",
        padding: "12px 18px",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        borderBottom: isLast ? "none" : "1px solid var(--rule-2)",
        textAlign: "left",
        transition: "background 0.12s",
      }}
    >
      <Avatar id={t.from} name={t.fromName} size={28} />
      <span
        className="lr-name"
        style={{ fontSize: 13, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
      >
        {t.fromName.split(" ")[0]}
      </span>
      <I.arrow size={12} />
      <Avatar id={t.to} name={t.toName} size={28} />
      <span
        className="lr-name"
        style={{ fontSize: 13, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
      >
        {t.toName.split(" ")[0]}
      </span>
      <span
        className="lr-group mono"
        style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
      >
        {t.groupName}
      </span>
      <span
        className="mono tnum"
        style={{
          fontSize: 13,
          fontWeight: 500,
          textAlign: "right",
          whiteSpace: "nowrap",
          color: "var(--ink)",
        }}
      >
        {formatInr(t.amount)}
      </span>
    </button>
  );
}
