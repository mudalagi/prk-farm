// Server-side report data layer. Given a tenant and a date range, fetches
// all expenses + splits in scope, derives per-member contributions, and
// returns the typed payload the report sheet renders from.
//
// Splits are read straight off `expense_splits.share_amount`, which is
// frozen at expense creation — so historical reports never shift when
// ownership percentages change.

import { createClient } from "@/lib/supabase/server";

export type ReportRange = {
  start: string; // ISO yyyy-mm-dd, inclusive
  end: string; //   ISO yyyy-mm-dd, inclusive
  label: string;
  kind: "monthly" | "adhoc";
};

export type ReportMember = {
  id: string;
  name: string;
  paid: number;
  owesShare: number;
  net: number; // paid - owesShare
};

export type ReportExpense = {
  id: string;
  description: string;
  amount: number;
  date: string;
  paidById: string;
  paidByName: string;
  groupId: string;
  groupName: string;
};

export type ReportGroupStat = {
  id: string;
  name: string;
  total: number; // total in the period
  count: number; // number of expenses in the period
  memberCount: number;
  sharePct: number; // % of tenant total for the period
  prevTotal: number;
  deltaPct: number; // round((cur - prev) / prev * 100); 0 if prev is 0
  tag: "active" | "recurring"; // recurring = many small entries
};

export type ReportSettlement = {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
};

export type TagStat = {
  id: string;
  name: string;
  color: string;
  total: number;
  count: number;
};

export type ReportData = {
  tenantName: string;
  range: ReportRange;
  totalSpent: number;
  totalToSettle: number;
  myStat: ReportMember | null;
  members: ReportMember[]; // sorted by paid desc
  topExpenses: ReportExpense[]; // top 5 by amount in range
  groups: ReportGroupStat[]; // groups with activity in the period, by total desc
  settlements: ReportSettlement[];
  tagStats: TagStat[]; // expense totals per tag for the period
  generatedAt: string; // ISO timestamp
  expenseCount: number;
};

// Inclusive [start, end] day count.
function dayCount(startIso: string, endIso: string): number {
  const a = new Date(`${startIso}T00:00:00Z`).getTime();
  const b = new Date(`${endIso}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

// The prior comparable window: same length, ending the day before `start`.
function priorWindow(range: ReportRange): { start: string; end: string } {
  const len = dayCount(range.start, range.end);
  const startMs = new Date(`${range.start}T00:00:00Z`).getTime();
  const prevEnd = new Date(startMs - 86_400_000);
  const prevStart = new Date(startMs - len * 86_400_000);
  return {
    start: prevStart.toISOString().slice(0, 10),
    end: prevEnd.toISOString().slice(0, 10),
  };
}

// Greedy settlement simplification: pair the biggest debtor with the
// biggest creditor until everyone's net is within ₹1 of zero. Produces
// the minimum number of transfers needed to clear the period.
export function buildSettlements(members: ReportMember[]): ReportSettlement[] {
  const creditors = members
    .filter((m) => m.net > 1)
    .map((m) => ({ id: m.id, name: m.name, n: m.net }))
    .sort((a, b) => b.n - a.n);
  const debtors = members
    .filter((m) => m.net < -1)
    .map((m) => ({ id: m.id, name: m.name, n: -m.net }))
    .sort((a, b) => b.n - a.n);

  const out: ReportSettlement[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const amt = Math.min(d.n, c.n);
    if (amt > 1) {
      out.push({
        fromId: d.id,
        fromName: d.name,
        toId: c.id,
        toName: c.name,
        amount: Math.round(amt),
      });
    }
    d.n -= amt;
    c.n -= amt;
    if (d.n < 1) i++;
    if (c.n < 1) j++;
  }
  return out;
}

export async function fetchReportData(
  tenantId: string,
  range: ReportRange,
  currentUserId: string,
  // Optional: pass a pre-created client (e.g. admin client for cron jobs).
  // When omitted, creates a user-scoped client via cookie.
  clientOverride?: Awaited<ReturnType<typeof createClient>>,
): Promise<ReportData> {
  const supabase = clientOverride ?? (await createClient());

  // The Supabase clients return user-scoped JWTs, so RLS already
  // restricts us to this tenant's data. No extra `tenant_id` filter
  // is needed beyond `groups.tenant_id` (used for the prev-period query).
  const [tenantRes, membersRes, groupsRes, expensesRes] = await Promise.all([
    supabase.from("tenants").select("name").eq("id", tenantId).single(),
    supabase
      .from("tenant_members")
      .select("user_id, profiles(id, display_name)")
      .eq("tenant_id", tenantId),
    supabase
      .from("groups")
      .select("id, name, group_members(user_id)")
      .eq("tenant_id", tenantId),
    supabase
      .from("expenses")
      .select(
        "id, group_id, description, amount, date, paid_by, " +
          "profiles!expenses_paid_by_fkey(display_name), " +
          "groups!inner(id, name, tenant_id), " +
          "expense_splits(user_id, share_amount), " +
          "expense_tags(tag_id, tags(id, name, color))",
      )
      .eq("groups.tenant_id", tenantId)
      .gte("date", range.start)
      .lte("date", range.end),
  ]);

  const tenantName = tenantRes.data?.name ?? "Farm";

  type MemberRow = { user_id: string; profiles: { id: string; display_name: string } | null };
  type GroupRow = { id: string; name: string; group_members: { user_id: string }[] | null };
  type ExpenseRow = {
    id: string;
    group_id: string;
    description: string;
    amount: number;
    date: string;
    paid_by: string;
    profiles: { display_name: string } | null;
    groups: { id: string; name: string; tenant_id: string } | null;
    expense_splits: { user_id: string; share_amount: number }[] | null;
    expense_tags: { tag_id: string; tags: { id: string; name: string; color: string } | null }[] | null;
  };

  const memberRows = (membersRes.data ?? []) as unknown as MemberRow[];
  const groupRows = (groupsRes.data ?? []) as unknown as GroupRow[];
  const expenseRows = (expensesRes.data ?? []) as unknown as ExpenseRow[];

  const nameByMember = new Map<string, string>();
  for (const m of memberRows) {
    if (m.profiles) nameByMember.set(m.profiles.id, m.profiles.display_name);
  }

  // Per-member paid + owes-share accumulators.
  const paidBy = new Map<string, number>();
  const owesBy = new Map<string, number>();
  for (const m of memberRows) {
    if (m.profiles) {
      paidBy.set(m.profiles.id, 0);
      owesBy.set(m.profiles.id, 0);
    }
  }
  for (const e of expenseRows) {
    const amt = Number(e.amount);
    paidBy.set(e.paid_by, (paidBy.get(e.paid_by) ?? 0) + amt);
    for (const s of e.expense_splits ?? []) {
      owesBy.set(s.user_id, (owesBy.get(s.user_id) ?? 0) + Number(s.share_amount));
    }
  }

  const members: ReportMember[] = memberRows
    .filter((m) => m.profiles)
    .map((m) => {
      const id = m.profiles!.id;
      const paid = paidBy.get(id) ?? 0;
      const owesShare = owesBy.get(id) ?? 0;
      return {
        id,
        name: m.profiles!.display_name,
        paid,
        owesShare,
        net: paid - owesShare,
      };
    })
    .sort((a, b) => b.paid - a.paid);

  // Top 5 expenses by amount.
  const topExpenses: ReportExpense[] = [...expenseRows]
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 5)
    .map((e) => ({
      id: e.id,
      description: e.description,
      amount: Number(e.amount),
      date: e.date,
      paidById: e.paid_by,
      paidByName: e.profiles?.display_name ?? "Unknown",
      groupId: e.group_id,
      groupName: e.groups?.name ?? "—",
    }));

  // Per-group totals in the period.
  const groupTotal = new Map<string, { total: number; count: number }>();
  for (const e of expenseRows) {
    const cur = groupTotal.get(e.group_id) ?? { total: 0, count: 0 };
    cur.total += Number(e.amount);
    cur.count += 1;
    groupTotal.set(e.group_id, cur);
  }
  const totalSpent = Array.from(groupTotal.values()).reduce((a, g) => a + g.total, 0);

  // Prior-period totals for delta. Fetched only for groups with activity in
  // the current window so we don't pull data we won't display.
  const activeGroupIds = Array.from(groupTotal.keys());
  const prev = priorWindow(range);
  const prevTotals = new Map<string, number>();
  if (activeGroupIds.length > 0) {
    const prevRes = await supabase
      .from("expenses")
      .select("group_id, amount")
      .in("group_id", activeGroupIds)
      .gte("date", prev.start)
      .lte("date", prev.end);
    for (const r of (prevRes.data ?? []) as { group_id: string; amount: number }[]) {
      prevTotals.set(r.group_id, (prevTotals.get(r.group_id) ?? 0) + Number(r.amount));
    }
  }

  const groups: ReportGroupStat[] = groupRows
    .filter((g) => groupTotal.has(g.id))
    .map((g) => {
      const { total, count } = groupTotal.get(g.id)!;
      const prevTotal = prevTotals.get(g.id) ?? 0;
      const deltaPct =
        prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : 0;
      // "recurring" heuristic: many small entries (≥ 6 in window and an
      // average under ₹10k). Everything else reads as "active".
      const avg = count ? total / count : 0;
      const tag: "active" | "recurring" = count >= 6 && avg < 10_000 ? "recurring" : "active";
      return {
        id: g.id,
        name: g.name,
        total,
        count,
        memberCount: g.group_members?.length ?? 0,
        sharePct: totalSpent > 0 ? (total / totalSpent) * 100 : 0,
        prevTotal,
        deltaPct,
        tag,
      };
    })
    .sort((a, b) => b.total - a.total);

  const settlements = buildSettlements(members);
  const totalToSettle = settlements.reduce((a, s) => a + s.amount, 0);
  const myStat = members.find((m) => m.id === currentUserId) ?? null;

  // Tag breakdown: sum expense amounts per tag (excluding settlements).
  const tagMap = new Map<string, TagStat>();
  for (const e of (expensesRes.data ?? []) as unknown as ExpenseRow[]) {
    const row = e;
    const amt = Number(row.amount);
    const etags = row.expense_tags ?? [];
    if (etags.length === 0) {
      const cur = tagMap.get("__none__") ?? { id: "__none__", name: "Uncategorized", color: "#666", total: 0, count: 0 };
      cur.total += amt;
      cur.count += 1;
      tagMap.set("__none__", cur);
    } else {
      for (const et of etags) {
        if (!et.tags) continue;
        const cur = tagMap.get(et.tags.id) ?? { id: et.tags.id, name: et.tags.name, color: et.tags.color, total: 0, count: 0 };
        cur.total += amt;
        cur.count += 1;
        tagMap.set(et.tags.id, cur);
      }
    }
  }
  const tagStats: TagStat[] = Array.from(tagMap.values()).sort((a, b) => b.total - a.total);

  return {
    tenantName,
    range,
    totalSpent,
    totalToSettle,
    myStat,
    members,
    topExpenses,
    groups,
    settlements,
    tagStats,
    generatedAt: new Date().toISOString(),
    expenseCount: expenseRows.length,
  };
}

// ───────── Date-range presets ─────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

function monthName(d: Date): string {
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

export type RangePresetId =
  | "last-month"
  | "this-month"
  | "this-week"
  | "last-week"
  | "this-quarter"
  | "ytd"
  | "custom";

// "monthly" is the default delivery; it always means *last calendar month*
// (matches the cron that runs on the 1st of each month).
export function rangeForPreset(preset: RangePresetId, now: Date = new Date()): ReportRange {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  switch (preset) {
    case "last-month": {
      const lastMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      return {
        start: isoDate(startOfMonth(lastMonth)),
        end: isoDate(endOfMonth(lastMonth)),
        label: monthName(lastMonth),
        kind: "monthly",
      };
    }
    case "this-month": {
      return {
        start: isoDate(startOfMonth(today)),
        end: isoDate(today),
        label: `${monthName(today)} · to date`,
        kind: "adhoc",
      };
    }
    case "this-week": {
      const dow = today.getUTCDay(); // 0 = Sun
      const monday = new Date(today);
      monday.setUTCDate(today.getUTCDate() - ((dow + 6) % 7));
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);
      return {
        start: isoDate(monday),
        end: isoDate(sunday < today ? sunday : today),
        label: `Week of ${monday.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })}`,
        kind: "adhoc",
      };
    }
    case "last-week": {
      const dow = today.getUTCDay();
      const lastMon = new Date(today);
      lastMon.setUTCDate(today.getUTCDate() - ((dow + 6) % 7) - 7);
      const lastSun = new Date(lastMon);
      lastSun.setUTCDate(lastMon.getUTCDate() + 6);
      return {
        start: isoDate(lastMon),
        end: isoDate(lastSun),
        label: `Week of ${lastMon.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })}`,
        kind: "adhoc",
      };
    }
    case "this-quarter": {
      const q = Math.floor(today.getUTCMonth() / 3);
      const qStart = new Date(Date.UTC(today.getUTCFullYear(), q * 3, 1));
      return {
        start: isoDate(qStart),
        end: isoDate(today),
        label: `Q${q + 1} ${today.getUTCFullYear()}`,
        kind: "adhoc",
      };
    }
    case "ytd": {
      return {
        start: isoDate(new Date(Date.UTC(today.getUTCFullYear(), 0, 1))),
        end: isoDate(today),
        label: `Year to date ${today.getUTCFullYear()}`,
        kind: "adhoc",
      };
    }
    case "custom": {
      // Caller should supply explicit start/end; fall through to this-month.
      return rangeForPreset("this-month", now);
    }
  }
}

// Build a range from explicit start/end ISO strings — used when the user
// picks a custom window. The label is derived from the dates.
export function customRange(start: string, end: string): ReportRange {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  const sameMonth = s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth();
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: sameMonth ? undefined : "short",
      year: "numeric",
      timeZone: "UTC",
    });
  const fmtShort = (d: Date) =>
    d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  const label = sameMonth ? `${fmtShort(s)}–${fmt(e)}` : `${fmtShort(s)} – ${fmt(e)}`;
  return { start, end, label, kind: "adhoc" };
}
