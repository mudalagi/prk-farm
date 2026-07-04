import { requireUserAndTenant } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ViewTransition } from "react";
import { BalancesView, type Settlement, type LedgerRow, type RibbonMember } from "./balances-view";

type BalanceRow = { group_id: string; creditor_id: string; debtor_id: string; net_amount: number };

// Simplify pairwise balances into a minimal transfer set (greedy creditor/debtor match).
function simplifyNet(net: Map<string, number>): { from: string; to: string; amount: number }[] {
  const creditors = Array.from(net.entries()).filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]);
  const debtors = Array.from(net.entries()).filter(([, v]) => v < -1).sort((a, b) => a[1] - b[1]);
  const out: { from: string; to: string; amount: number }[] = [];
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

export default async function BalancesPage() {
  const { user, tenantId } = await requireUserAndTenant();

  const supabase = await createClient();
  const [tenantRes, groupsRes] = await Promise.all([
    supabase.from("tenants").select("name").eq("id", tenantId).single(),
    supabase.from("groups").select("id, name").eq("tenant_id", tenantId),
  ]);
  const tenantName = tenantRes.data?.name ?? "Farm";
  const groups = groupsRes.data ?? [];
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
  const groupIds = groups.map((g) => g.id);

  // Fetch tenant-wide data in parallel
  const [balancesRes, membersRes] = groupIds.length
    ? await Promise.all([
        supabase.from("group_balances").select("*").in("group_id", groupIds),
        supabase
          .from("tenant_members")
          .select("user_id, profiles(id, display_name)")
          .eq("tenant_id", tenantId),
      ])
    : [{ data: [] as BalanceRow[] }, { data: [] as unknown[] }];

  const balances = (balancesRes.data ?? []) as BalanceRow[];
  type MemberRow = { user_id: string; profiles: { id: string; display_name: string } | null };
  const rawMembers = (membersRes.data ?? []) as unknown as MemberRow[];
  const memberById = new Map<string, { id: string; name: string }>();
  for (const m of rawMembers) {
    if (m.profiles) memberById.set(m.profiles.id, { id: m.profiles.id, name: m.profiles.display_name });
  }
  // Fallback name if a user appears in balances but not memberships (edge case)
  const name = (id: string) => memberById.get(id)?.name ?? "Unknown";

  // Simplify per group → collect all tenant-wide transfers with their group label.
  type Transfer = { from: string; to: string; amount: number; groupId: string; groupName: string };
  const allTransfers: Transfer[] = [];
  const byGroup = new Map<string, BalanceRow[]>();
  for (const b of balances) {
    const list = byGroup.get(b.group_id) ?? [];
    list.push(b);
    byGroup.set(b.group_id, list);
  }
  for (const [gid, rows] of byGroup) {
    const net = new Map<string, number>();
    for (const r of rows) {
      net.set(r.creditor_id, (net.get(r.creditor_id) ?? 0) + Number(r.net_amount));
      net.set(r.debtor_id, (net.get(r.debtor_id) ?? 0) - Number(r.net_amount));
    }
    for (const t of simplifyNet(net)) {
      allTransfers.push({ ...t, groupId: gid, groupName: groupNameById.get(gid) ?? "Unknown" });
    }
  }

  // Consolidate per counterparty for the "Settle up" section.
  const byPerson = new Map<string, { id: string; in: number; out: number; groups: Set<string> }>();
  for (const t of allTransfers) {
    if (t.to === user.id) {
      const e = byPerson.get(t.from) ?? { id: t.from, in: 0, out: 0, groups: new Set() };
      e.in += t.amount;
      e.groups.add(t.groupName);
      byPerson.set(t.from, e);
    }
    if (t.from === user.id) {
      const e = byPerson.get(t.to) ?? { id: t.to, in: 0, out: 0, groups: new Set() };
      e.out += t.amount;
      e.groups.add(t.groupName);
      byPerson.set(t.to, e);
    }
  }
  const settlements: Settlement[] = Array.from(byPerson.values())
    .map((e) => ({ id: e.id, name: name(e.id), net: e.in - e.out, groups: Array.from(e.groups) }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  const totalOwedToYou = settlements.filter((s) => s.net > 0).reduce((a, s) => a + s.net, 0);
  const totalYouOwe = settlements.filter((s) => s.net < 0).reduce((a, s) => a - s.net, 0);
  const net = totalOwedToYou - totalYouOwe;

  const ledger: LedgerRow[] = allTransfers.map((t) => ({
    from: t.from,
    fromName: name(t.from),
    to: t.to,
    toName: name(t.to),
    amount: t.amount,
    groupName: t.groupName,
  }));

  // Raw pairwise: debtor pays creditor directly, without debt-minimization.
  const rawLedger: LedgerRow[] = balances
    .filter((b) => Number(b.net_amount) > 1)
    .map((b) => ({
      from: b.debtor_id,
      fromName: name(b.debtor_id),
      to: b.creditor_id,
      toName: name(b.creditor_id),
      amount: Math.round(Number(b.net_amount)),
      groupName: groupNameById.get(b.group_id) ?? "Unknown",
    }));

  const ribbonMembers: RibbonMember[] = Array.from(memberById.values());

  return (
    <ViewTransition
      enter={{ "nav-forward": "slide-from-right", "nav-back": "slide-from-left", default: "none" }}
      exit={{ "nav-forward": "slide-to-left", "nav-back": "slide-to-right", default: "none" }}
      default="none"
    >
      <div style={{ viewTransitionName: "screen" }}>
        <BalancesView
          tenantName={tenantName}
          net={net}
          settlements={settlements}
          ledger={ledger}
          rawLedger={rawLedger}
          ribbonMembers={ribbonMembers}
          groupCount={groups.length}
        />
      </div>
    </ViewTransition>
  );
}
