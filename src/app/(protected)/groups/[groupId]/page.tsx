import { requireUserAndTenant } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canManageTenant } from "@/lib/platform";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ViewTransition } from "react";
import { OwnershipPie } from "@/components/ui/ownership-pie";
import { GroupDetailTabs, type TabMember, type TabExpense, type TabTransfer } from "@/components/ui/group-detail-tabs";
import { I } from "@/components/ui/icons";
import { formatInr, formatInrSigned, formatUpdatedAt } from "@/lib/format";
import { ImportExportButtons } from "@/components/import-export-buttons";

type BalanceRow = { group_id: string; creditor_id: string; debtor_id: string; net_amount: number };

// Turn pairwise (creditor, debtor, amount) rows into a minimized list of
// transfers using the greedy creditor/debtor matching from the spec.
function simplifyTransfers(balances: BalanceRow[]): TabTransfer[] {
  const net = new Map<string, number>();
  for (const b of balances) {
    net.set(b.creditor_id, (net.get(b.creditor_id) ?? 0) + Number(b.net_amount));
    net.set(b.debtor_id, (net.get(b.debtor_id) ?? 0) - Number(b.net_amount));
  }
  const creditors = Array.from(net.entries()).filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]);
  const debtors = Array.from(net.entries()).filter(([, v]) => v < -1).sort((a, b) => a[1] - b[1]);
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


export default async function GroupDetailPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const { user, tenantId } = await requireUserAndTenant();

  const supabase = await createClient();

  const [groupRes, membersRes, expensesRes, balancesRes] = await Promise.all([
    supabase.from("groups").select("id, name, updated_at, created_at").eq("id", groupId).eq("tenant_id", tenantId).single(),
    supabase
      .from("group_members")
      .select("user_id, ownership_pct, profiles(id, display_name, email)")
      .eq("group_id", groupId),
    supabase
      .from("expenses")
      .select("id, description, date, amount, paid_by, created_by, is_settlement, profiles!expenses_paid_by_fkey(display_name), expense_tags(tag_id, tags(id, name, color))")
      .eq("group_id", groupId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .then(async (res) => {
        if (!res.error) return res;
        const msg = res.error.message;

        // is_settlement column missing — retry without it (keeps expense_tags).
        if (/is_settlement/.test(msg)) {
          const r2 = await supabase
            .from("expenses")
            .select("id, description, date, amount, paid_by, created_by, profiles!expenses_paid_by_fkey(display_name), expense_tags(tag_id, tags(id, name, color))")
            .eq("group_id", groupId)
            .order("date", { ascending: false })
            .order("created_at", { ascending: false });
          if (!r2.error) return r2;
        }

        // expense_tags table missing — retry without joins.
        if (/expense_tags|relationship/.test(msg)) {
          return supabase
            .from("expenses")
            .select("id, description, date, amount, paid_by, created_by, profiles!expenses_paid_by_fkey(display_name)")
            .eq("group_id", groupId)
            .order("date", { ascending: false })
            .order("created_at", { ascending: false });
        }

        return res;
      }),
    supabase.from("group_balances").select("*").eq("group_id", groupId),
  ]);

  const group = groupRes.data;
  if (!group) notFound();

  const isTenantAdmin = await canManageTenant(tenantId);
  // Retained name — callers used this to allow "elevated edit/delete" of
  // other people's expenses. Today's equivalent: tenant admin or platform
  // admin.
  const isTenantOwner = isTenantAdmin;

  type MemberRow = { user_id: string; ownership_pct: number; profiles: { id: string; display_name: string; email: string } | null };
  const rawMembers = (membersRes.data ?? []) as unknown as MemberRow[];
  type ExpenseRow = {
    id: string;
    description: string;
    date: string;
    amount: number;
    paid_by: string;
    created_by: string;
    is_settlement: boolean;
    profiles: { display_name: string } | null;
    expense_tags: { tag_id: string; tags: { id: string; name: string; color: string } | null }[];
  };
  const rawExpenses = (expensesRes.data ?? []) as unknown as ExpenseRow[];
  const balances = (balancesRes.data ?? []) as BalanceRow[];

  // Per-member in-group net balance for the Members tab.
  const netById = new Map<string, number>();
  for (const b of balances) {
    netById.set(b.creditor_id, (netById.get(b.creditor_id) ?? 0) + Number(b.net_amount));
    netById.set(b.debtor_id, (netById.get(b.debtor_id) ?? 0) - Number(b.net_amount));
  }

  const members: TabMember[] = rawMembers
    .filter((m) => m.profiles)
    .map((m) => ({
      id: m.profiles!.id,
      name: m.profiles!.display_name,
      email: m.profiles!.email,
      ownership_pct: Number(m.ownership_pct),
      net_in_group: Math.round(netById.get(m.profiles!.id) ?? 0),
    }));

  const expenses: TabExpense[] = rawExpenses.map((e) => ({
    id: e.id,
    description: e.description,
    date: e.date,
    amount: Number(e.amount),
    paid_by: e.paid_by,
    paid_by_name: e.profiles?.display_name ?? "Unknown",
    is_settlement: e.is_settlement ?? false,
    can_edit: e.created_by === user.id || isTenantOwner,
    edit_href: `/groups/${groupId}/expenses/${e.id}/edit`,
    tags: (e.expense_tags ?? [])
      .map((et) => et.tags)
      .filter((t): t is { id: string; name: string; color: string } => t !== null),
  }));

  const transfers = simplifyTransfers(balances);
  // Exclude settlements from the total farm spend figure.
  const total = expenses.filter((e) => !e.is_settlement).reduce((a, e) => a + e.amount, 0);
  const myBal = netById.get(user.id) ?? 0;
  const updatedLabel = formatUpdatedAt(group.updated_at);

  return (
    <ViewTransition
      enter={{ "nav-forward": "slide-from-right", "nav-back": "slide-from-left", default: "none" }}
      exit={{ "nav-forward": "slide-to-left", "nav-back": "slide-to-right", default: "none" }}
      default="none"
    >
      <div style={{ viewTransitionName: "screen" }}>
        <div
          className="mx-auto"
          style={{ maxWidth: 1120, padding: "clamp(18px, 3vw, 28px) clamp(18px, 4vw, 44px) 56px" }}
        >
          <Link
            href="/groups"
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
            <I.chevronL size={12} />
            Back
          </Link>

          {/* Header */}
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
                  style={{
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: "var(--accent-wash)",
                    color: "var(--accent)",
                  }}
                >
                  active
                </span>
                <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  Updated {updatedLabel}
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
                {group.name}
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
            {members.length > 0 && (
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
                <OwnershipPie
                  members={members.map((m) => ({ id: m.id, pct: m.ownership_pct }))}
                  size={160}
                />
              </div>
            )}
          </div>

          {/* Action bar */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            <Link href={`/groups/${groupId}/expenses/new`} className="btn btn-accent shimmer">
              <I.plus size={14} /> Log expense
            </Link>
            {isTenantAdmin && (
              <Link href={`/groups/${groupId}/members`} className="btn btn-ghost">
                <I.users size={14} /> Add member
              </Link>
            )}
            <Link href={`/groups/${groupId}/settle`} className="btn btn-ghost">
              <I.arrow size={14} /> Settle
            </Link>
            <Link href={`/groups/${groupId}/edit`} className="btn btn-ghost">
              <I.edit size={14} /> Edit group
            </Link>
            <ImportExportButtons groupId={groupId} />
          </div>

          {/* Tabs */}
          <GroupDetailTabs
            expenses={expenses}
            members={members}
            transfers={transfers}
            currentUserId={user.id}
            groupId={groupId}
          />
        </div>
      </div>
    </ViewTransition>
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
