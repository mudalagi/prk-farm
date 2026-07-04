import Link from "next/link";
import { OwnershipPie } from "@/components/ui/ownership-pie";
import { GroupDetailTabs, type TabMember, type TabExpense, type TabTransfer } from "@/components/ui/group-detail-tabs";
import { I } from "@/components/ui/icons";
import { formatInr, formatInrSigned } from "@/lib/format";
import { EXPENSES, CURRENT_USER_ID, memberById } from "../seed";

const GROUP = { id: "g1", name: "Crop Season 2026", tag: "active", updated_at_label: "2 hours ago" };
const GROUP_MEMBERS = ["u1", "u2", "u3", "u4", "u5", "u6"];

// Simple fabricated net balances — these sum to zero.
const IN_GROUP_BALANCES: Record<string, number> = {
  u1: -1968,
  u2: 8400,
  u3: -12400,
  u4: 520,
  u5: -840,
  u6: 6288,
};

function simplifyFromNet(net: Record<string, number>): TabTransfer[] {
  const creditors = Object.entries(net).filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]);
  const debtors = Object.entries(net).filter(([, v]) => v < -1).sort((a, b) => a[1] - b[1]);
  const out: TabTransfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const [dId, dVal] = debtors[i];
    const [cId, cVal] = creditors[j];
    const amt = Math.round(Math.min(-dVal, cVal));
    if (amt > 1) out.push({ from: dId, to: cId, amount: amt });
    debtors[i][1] = dVal + amt;
    creditors[j][1] = cVal - amt;
    if (Math.abs(debtors[i][1]) < 1) i++;
    if (Math.abs(creditors[j][1]) < 1) j++;
  }
  return out;
}

export default function PreviewGroupPage() {
  const members: TabMember[] = GROUP_MEMBERS.map((id) => {
    const m = memberById(id);
    return {
      id: m.id,
      name: m.name,
      email: m.email,
      ownership_pct: m.ownership_pct,
      net_in_group: IN_GROUP_BALANCES[id] ?? 0,
    };
  });

  const expenses: TabExpense[] = EXPENSES.filter((e) => e.group_id === GROUP.id).map((e) => {
    const payer = memberById(e.paid_by);
    return {
      id: e.id,
      description: e.description,
      date: e.date,
      amount: e.amount,
      paid_by: payer.id,
      paid_by_name: payer.name,
      is_settlement: false,
      can_edit: payer.id === CURRENT_USER_ID,
      edit_href: "#",
    };
  });

  const transfers = simplifyFromNet(IN_GROUP_BALANCES);
  const total = expenses.reduce((a, e) => a + e.amount, 0);
  const myBal = IN_GROUP_BALANCES[CURRENT_USER_ID] ?? 0;

  return (
    <div style={{ viewTransitionName: "screen" }}>
      <div className="mx-auto" style={{ maxWidth: 1120, padding: "clamp(18px, 3vw, 28px) clamp(18px, 4vw, 44px) 56px" }}>
        <Link
          href="/preview/dashboard"
          className="mono"
          style={{
            color: "var(--ink-3)",
            fontSize: 12,
            textDecoration: "none",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 16,
          }}
        >
          <I.chevronL size={12} /> Back
        </Link>

        <div
          style={{
            display: "flex",
            gap: 32,
            marginBottom: 28,
            flexWrap: "wrap",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <span
                className="eyebrow"
                style={{ padding: "3px 8px", borderRadius: 999, background: "var(--accent-wash)", color: "var(--accent)" }}
              >
                {GROUP.tag}
              </span>
              <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                Updated {GROUP.updated_at_label}
              </span>
            </div>
            <h1
              className="serif"
              style={{
                fontSize: "clamp(36px, 6vw, 58px)",
                margin: 0,
                letterSpacing: "-0.025em",
                lineHeight: 1,
                color: "var(--ink)",
              }}
            >
              {GROUP.name}
            </h1>
            <div style={{ display: "flex", gap: 28, marginTop: 20, flexWrap: "wrap" }}>
              <Stat label="Total spent" value={formatInr(total)} big />
              <Stat label="Expenses" value={expenses.length} />
              <Stat label="Members" value={members.length} />
              <Stat
                label="Your balance"
                value={
                  <span style={{ color: myBal >= 0 ? "var(--pos)" : "var(--neg)" }}>
                    {formatInrSigned(myBal)}
                  </span>
                }
              />
            </div>
          </div>
          <div
            className="hidden md:flex"
            style={{
              padding: 16,
              borderRadius: 16,
              border: "1px solid var(--rule)",
              background: "var(--card)",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <OwnershipPie members={members.map((m) => ({ id: m.id, pct: m.ownership_pct, name: m.name }))} size={160} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <Link href="#" className="btn btn-accent shimmer">
            <I.plus size={14} /> Log expense
          </Link>
          <Link href="#" className="btn btn-ghost">
            <I.users size={14} /> Add member
          </Link>
          <Link href="#" className="btn btn-ghost">
            <I.edit size={14} /> Edit group
          </Link>
        </div>

        <GroupDetailTabs
          expenses={expenses}
          members={members}
          transfers={transfers}
          rawTransfers={[]}
          currentUserId={CURRENT_USER_ID}
          groupId={GROUP.id}
        />
      </div>
    </div>
  );
}

function Stat({ label, value, big = false }: { label: string; value: React.ReactNode; big?: boolean }) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 4 }}>
        {label}
      </div>
      <div
        className={big ? "serif" : "mono tnum"}
        style={{
          fontSize: big ? 28 : 18,
          fontWeight: big ? 400 : 500,
          color: "var(--ink)",
          letterSpacing: big ? "-0.01em" : 0,
        }}
      >
        {value}
      </div>
    </div>
  );
}
