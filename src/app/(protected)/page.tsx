import { requireUserAndTenant } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ViewTransition } from "react";
import { AnimatedInr } from "@/components/ui/animated-inr";
import { MiniStat } from "@/components/ui/mini-stat";
import { SectionHeader } from "@/components/ui/section-header";
import { GroupCard, type GroupCardMember } from "@/components/ui/group-card";
import { ExpenseRow } from "@/components/ui/expense-row";
import { ReportsCtaCard } from "@/components/ui/reports-cta-card";
import { I } from "@/components/ui/icons";
import { firstName } from "@/lib/format";

function weekBuckets(rows: { date: string; amount: number }[]): { total: number; spark: number[] } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: number[] = new Array(7).fill(0);
  let total = 0;
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 6);
  for (const r of rows) {
    const d = new Date(r.date);
    d.setHours(0, 0, 0, 0);
    if (d < cutoff || d > today) continue;
    const offset = Math.round((d.getTime() - cutoff.getTime()) / 86_400_000);
    if (offset < 0 || offset > 6) continue;
    const amt = Number(r.amount) || 0;
    days[offset] += amt;
    total += amt;
  }
  return { total, spark: days };
}

type BalanceRow = { group_id: string; creditor_id: string; debtor_id: string; net_amount: number };

function greet() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function formatDateHeader(d: Date) {
  const weekday = d.toLocaleDateString("en-IN", { weekday: "short" });
  const day = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return `${weekday} · ${day}`;
}

export default async function DashboardPage() {
  const { user, tenantId } = await requireUserAndTenant();

  const supabase = await createClient();

  const [summaryRes, profileRes, tenantRes, groupsRes, pendingInvitesRes] = await Promise.all([
    supabase.rpc("tenant_summary", { p_tenant_id: tenantId, p_user_id: user.id }),
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
    supabase.from("tenants").select("name").eq("id", tenantId).single(),
    supabase
      .from("groups")
      .select("id, name, created_at, updated_at, group_members(user_id, profiles(id, display_name))")
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false }),
    // RLS policy on tenant_invites lets the invitee see their own pending
    // invites even before they're a member. Filter tenants to the ones they
    // aren't already in below.
    supabase
      .from("tenant_invites")
      .select("id, token, tenant_id, role, expires_at, tenants(name)")
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString()),
  ]);

  const totals = summaryRes.data?.[0] ?? { total_you_owe: 0, total_owed_to_you: 0 };
  const totalYouOwe = Number(totals.total_you_owe) || 0;
  const totalOwedToYou = Number(totals.total_owed_to_you) || 0;
  const net = totalOwedToYou - totalYouOwe;
  const profile = profileRes.data;
  const tenant = tenantRes.data;
  type GroupRow = {
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
    group_members: { user_id: string; profiles: { id: string; display_name: string } | null }[] | null;
  };
  const groups: GroupRow[] = (groupsRes.data ?? []) as unknown as GroupRow[];
  const groupIds = groups.map((g) => g.id);

  // Recent expenses + per-group totals/expense count + per-group my balance.
  const [expensesRes, balancesRes, groupTotalsRes] = groupIds.length
    ? await Promise.all([
        supabase
          .from("expenses")
          .select("id, group_id, description, amount, date, paid_by, profiles!expenses_paid_by_fkey(display_name), groups!inner(name)")
          .in("group_id", groupIds)
          .order("date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(6),
        supabase.from("group_balances").select("*").in("group_id", groupIds),
        supabase.from("expenses").select("group_id, amount, date").in("group_id", groupIds),
      ])
    : [{ data: [] as unknown[] }, { data: [] as BalanceRow[] }, { data: [] as { group_id: string; amount: number; date: string }[] }];

  type ExpenseRowRaw = {
    id: string;
    group_id: string;
    description: string;
    amount: number;
    date: string;
    paid_by: string;
    profiles: { display_name: string } | null;
    groups: { name: string } | null;
  };
  const recentExpenses = (expensesRes.data ?? []) as ExpenseRowRaw[];
  const balances = (balancesRes.data ?? []) as BalanceRow[];
  const groupExpenseTotals = (groupTotalsRes.data ?? []) as { group_id: string; amount: number; date: string }[];
  const week = weekBuckets(groupExpenseTotals);

  const totalsByGroup = new Map<string, { total: number; count: number }>();
  for (const e of groupExpenseTotals) {
    const cur = totalsByGroup.get(e.group_id) ?? { total: 0, count: 0 };
    cur.total += Number(e.amount);
    cur.count += 1;
    totalsByGroup.set(e.group_id, cur);
  }

  const myBalanceByGroup = new Map<string, number>();
  for (const b of balances) {
    if (b.creditor_id !== user.id && b.debtor_id !== user.id) continue;
    const cur = myBalanceByGroup.get(b.group_id) ?? 0;
    const delta = b.creditor_id === user.id ? Number(b.net_amount) : -Number(b.net_amount);
    myBalanceByGroup.set(b.group_id, cur + delta);
  }

  const greeting = greet();
  const first = firstName(profile?.display_name);
  const today = formatDateHeader(new Date());
  const showDesktopLogExpense = groups.length > 0;
  const firstGroupId = groups[0]?.id;

  // Surface tenant invites the user hasn't accepted yet. Skip any for the
  // active tenant (they're already in it) — the pending-invite unique index
  // and the acceptance handler already ensure the membership side is clean,
  // but filtering here keeps the banner from being noisy.
  type PendingInvite = {
    id: string;
    token: string;
    tenant_id: string;
    role: "admin" | "member";
    expires_at: string;
    tenants: { name: string } | null;
  };
  const pendingInvites = ((pendingInvitesRes.data ?? []) as unknown as PendingInvite[]).filter(
    (i) => i.tenant_id !== tenantId,
  );

  return (
    <ViewTransition
      enter={{ "nav-forward": "slide-from-right", "nav-back": "slide-from-left", default: "none" }}
      exit={{ "nav-forward": "slide-to-left", "nav-back": "slide-to-right", default: "none" }}
      default="none"
    >
      <div style={{ viewTransitionName: "screen" }}>
        <div
          className="mx-auto"
          style={{ maxWidth: 1120, padding: "clamp(18px, 3vw, 32px) clamp(18px, 4vw, 44px) 56px" }}
        >
          {/* Pending-invite banner: shown when someone invited this email to
              another tenant and they haven't accepted yet. */}
          {pendingInvites.length > 0 && (
            <div
              role="status"
              style={{
                marginBottom: 20,
                padding: "14px 18px",
                borderRadius: 14,
                background: "var(--accent-wash)",
                border: "1px solid color-mix(in oklch, var(--accent) 25%, transparent)",
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: "var(--accent)",
                  color: "var(--accent-ink)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <I.bell size={13} />
              </span>
              <div style={{ flex: "1 1 240px", fontSize: 13, color: "var(--ink-2)" }}>
                {pendingInvites.length === 1
                  ? `You've been invited to join ${pendingInvites[0].tenants?.name ?? "another tenant"}.`
                  : `You have ${pendingInvites.length} pending tenant invitations.`}
              </div>
              {pendingInvites.slice(0, 1).map((i) => (
                <Link
                  key={i.id}
                  href={`/auth/accept-invite?token=${encodeURIComponent(i.token)}`}
                  className="btn btn-accent"
                  style={{ height: 34, fontSize: 12 }}
                >
                  Accept {i.tenants?.name ?? "invite"}
                </Link>
              ))}
              {pendingInvites.length > 1 && (
                <Link
                  href="/profile"
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: "var(--ink-3)",
                    textDecoration: "none",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  see all →
                </Link>
              )}
            </div>
          )}

          {/* Top bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              marginBottom: 24,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                {today} · {tenant?.name ?? "Farm"}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: "clamp(18px, 2.2vw, 20px)", fontWeight: 500, color: "var(--ink-2)" }}>
                  {greeting},
                </span>
                <span
                  className="serif"
                  style={{
                    fontSize: "clamp(28px, 4.5vw, 34px)",
                    color: "var(--ink)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  <em>{first}</em>
                </span>
              </div>
            </div>
            <div className="hidden md:flex" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ width: 40, padding: 0 }}
                aria-label="Notifications"
              >
                <I.bell size={16} />
              </button>
              {showDesktopLogExpense && firstGroupId && (
                <Link
                  href={`/groups/${firstGroupId}/expenses/new`}
                  className="btn btn-accent shimmer"
                >
                  <I.plus size={14} /> Log expense
                </Link>
              )}
            </div>
          </div>

          {/* Hero */}
          <div
            className="rise"
            style={{
              position: "relative",
              overflow: "hidden",
              padding: "clamp(20px, 3.5vw, 40px) clamp(20px, 4vw, 44px)",
              borderRadius: 20,
              background: "var(--card)",
              border: "1px solid var(--rule)",
              marginBottom: 32,
            }}
          >
            <div className="mesh" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
            <div
              style={{
                position: "relative",
                display: "flex",
                gap: 32,
                flexWrap: "wrap",
                alignItems: "flex-end",
                justifyContent: "space-between",
              }}
            >
              <div style={{ flex: "1 1 280px", minWidth: 0 }}>
                <div className="eyebrow" style={{ marginBottom: 14 }}>
                  Your net position
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    className="serif"
                    style={{
                      fontSize: "clamp(56px, 10vw, 96px)",
                      lineHeight: 0.95,
                      color: net >= 0 ? "var(--pos)" : "var(--neg)",
                      letterSpacing: "-0.03em",
                    }}
                  >
                    <AnimatedInr value={Math.abs(net)} />
                  </div>
                  <div
                    style={{
                      fontSize: "clamp(13px, 1.6vw, 18px)",
                      color: "var(--ink-3)",
                      paddingBottom: 8,
                    }}
                  >
                    {net === 0 ? "all squared up" : net > 0 ? "in your favor" : "you owe"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 20, marginTop: 24, flexWrap: "wrap", alignItems: "center" }}>
                  <MiniStat label="People owe you" amount={totalOwedToYou} tone="pos" />
                  <div style={{ width: 1, alignSelf: "stretch", background: "var(--rule)" }} />
                  <MiniStat label="You owe" amount={totalYouOwe} tone="neg" />
                  {week.total > 0 && (
                    <>
                      <div style={{ width: 1, alignSelf: "stretch", background: "var(--rule)" }} />
                      <MiniStat label="This week" amount={week.total} tone="neutral" spark={week.spark} />
                    </>
                  )}
                </div>
              </div>
              <div className="hidden md:flex" style={{ flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
                <Link href="/balances" className="btn btn-ghost">
                  View balances <I.arrow size={12} />
                </Link>
                <Link href="/timeline" className="btn btn-ghost">
                  Timeline <I.arrow size={12} />
                </Link>
              </div>
            </div>
          </div>

          {/* Groups */}
          <SectionHeader
            title="Groups"
            trailing={`${groups.length} ${groups.length === 1 ? "active" : "active"}`}
            actionLabel="View all"
            actionHref="/groups"
          />
          {groups.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: "center", marginBottom: 32 }}>
              <div className="serif" style={{ fontSize: 22, color: "var(--ink)", marginBottom: 6 }}>
                No groups yet
              </div>
              <p style={{ color: "var(--ink-3)", fontSize: 13, margin: "0 0 20px" }}>
                Create your first group to start splitting expenses.
              </p>
              <Link href="/groups/new" className="btn btn-accent">
                <I.plus size={14} /> Create group
              </Link>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 12,
                marginBottom: 32,
                gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
              }}
            >
              {groups.slice(0, 6).map((g, i) => {
                const members: GroupCardMember[] = (g.group_members ?? [])
                  .map((gm) =>
                    gm.profiles ? { id: gm.profiles.id, name: gm.profiles.display_name } : null
                  )
                  .filter((m): m is GroupCardMember => m !== null);
                const totals = totalsByGroup.get(g.id) ?? { total: 0, count: 0 };
                const myBal = myBalanceByGroup.get(g.id);
                const updated = new Date(g.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
                return (
                  <GroupCard
                    key={g.id}
                    id={g.id}
                    name={g.name}
                    members={members}
                    expenseCount={totals.count}
                    totalInr={totals.total}
                    myBalance={myBal ?? null}
                    updatedLabel={updated}
                    idx={i}
                  />
                );
              })}
            </div>
          )}

          {/* Monthly statement — visible only once there's at least one
              group worth reporting on. */}
          {groups.length > 0 && <ReportsCtaCard />}

          {/* Recent */}
          <SectionHeader
            title="Recent activity"
            trailing="last 7 days"
            actionLabel="Timeline"
            actionHref="/timeline"
          />
          {recentExpenses.length === 0 ? (
            <div className="card" style={{ padding: 32, textAlign: "center" }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                No expenses yet
              </div>
              <p style={{ color: "var(--ink-3)", fontSize: 13, margin: 0 }}>
                When someone logs one, it&rsquo;ll appear here.
              </p>
            </div>
          ) : (
            <div className="card" style={{ overflow: "hidden", padding: 0 }}>
              {recentExpenses.map((e, i) => (
                <ExpenseRow
                  key={e.id}
                  href={`/groups/${e.group_id}`}
                  description={e.description}
                  amount={Number(e.amount)}
                  date={e.date}
                  paidById={e.paid_by}
                  paidByName={e.profiles?.display_name ?? "Unknown"}
                  groupName={e.groups?.name}
                  isLast={i === recentExpenses.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </ViewTransition>
  );
}
