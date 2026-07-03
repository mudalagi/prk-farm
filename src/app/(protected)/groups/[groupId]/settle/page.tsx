import { requireUserAndTenant } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { I } from "@/components/ui/icons";
import { SettleForm } from "./settle-form";

export default async function SettlePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const { user, tenantId } = await requireUserAndTenant();

  const supabase = await createClient();

  const [groupRes, membersRes, balancesRes] = await Promise.all([
    supabase
      .from("groups")
      .select("id, name")
      .eq("id", groupId)
      .eq("tenant_id", tenantId)
      .single(),
    supabase
      .from("group_members")
      .select("user_id, profiles(id, display_name)")
      .eq("group_id", groupId),
    supabase
      .from("group_balances")
      .select("creditor_id, debtor_id, net_amount")
      .eq("group_id", groupId),
  ]);

  if (!groupRes.data) notFound();
  const group = groupRes.data;

  type MemberRaw = {
    user_id: string;
    profiles: { id: string; display_name: string } | null;
  };

  const members = ((membersRes.data ?? []) as unknown as MemberRaw[])
    .filter((m) => m.profiles)
    .map((m) => ({ id: m.user_id, name: m.profiles!.display_name }));

  type BalRow = { creditor_id: string; debtor_id: string; net_amount: number };
  const rawBalances = (balancesRes.data ?? []) as BalRow[];

  // Run the same debt-minimization used by the Balances tab so the pre-filled
  // amounts match what the settlement plan recommends.
  function simplifyTransfers(rows: BalRow[]) {
    const net = new Map<string, number>();
    for (const b of rows) {
      net.set(b.creditor_id, (net.get(b.creditor_id) ?? 0) + Number(b.net_amount));
      net.set(b.debtor_id, (net.get(b.debtor_id) ?? 0) - Number(b.net_amount));
    }
    const creditors = [...net.entries()].filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]);
    const debtors  = [...net.entries()].filter(([, v]) => v < -1).sort((a, b) => a[1] - b[1]);
    const out: { from: string; to: string; amount: number }[] = [];
    let i = 0, j = 0;
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

  // Build map: "fromId:toId" → simplified settlement amount
  const balanceMap: Record<string, number> = {};
  for (const t of simplifyTransfers(rawBalances)) {
    balanceMap[`${t.from}:${t.to}`] = t.amount;
  }

  return (
    <main className="mx-auto w-full max-w-[480px] px-5 sm:px-8 py-8 sm:py-10">
      <Link
        href={`/groups/${groupId}`}
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

      <h1 className="font-display text-2xl font-bold text-ink">Record Settlement</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {group.name} · Record a direct payment between members. This adjusts
        balances without adding to total farm expenses.
      </p>

      <SettleForm
        groupId={groupId}
        members={members}
        currentUserId={user.id}
        balanceMap={balanceMap}
      />
    </main>
  );
}
