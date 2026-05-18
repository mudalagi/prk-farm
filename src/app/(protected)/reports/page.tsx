import { requireUserAndTenant } from "@/lib/auth";
import { ViewTransition } from "react";
import { formatInr } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { I } from "@/components/ui/icons";
import {
  customRange,
  fetchReportData,
  rangeForPreset,
  type RangePresetId,
  type ReportRange,
} from "./report-data";
import { ReportToolbar } from "./report-toolbar";
import "./report.css";

const VALID_PRESETS: RangePresetId[] = [
  "this-week",
  "last-week",
  "this-month",
  "last-month",
  "this-quarter",
  "ytd",
  "custom",
];

function resolveRange(params: {
  preset?: string;
  start?: string;
  end?: string;
}): { range: ReportRange; presetId: RangePresetId | null } {
  const { preset, start, end } = params;
  // Explicit start+end with no preset = custom range.
  if (start && end && isIsoDate(start) && isIsoDate(end) && (!preset || preset === "custom")) {
    return { range: customRange(start, end), presetId: "custom" };
  }
  if (preset && VALID_PRESETS.includes(preset as RangePresetId)) {
    return {
      range: rangeForPreset(preset as RangePresetId),
      presetId: preset as RangePresetId,
    };
  }
  // Default: last month (the cron's contract).
  return { range: rangeForPreset("last-month"), presetId: "last-month" };
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; start?: string; end?: string }>;
}) {
  const { user, tenantId } = await requireUserAndTenant();
  const params = await searchParams;
  const { range, presetId } = resolveRange(params);

  const data = await fetchReportData(tenantId, range, user.id);

  const generated = new Date(data.generatedAt).toLocaleString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const maxPaid = Math.max(1, ...data.members.map((m) => m.paid));
  const myNet = data.myStat?.net ?? 0;
  const myPositionTone: "pos" | "neg" = myNet >= 0 ? "pos" : "neg";

  // Story-driven lede.
  const lede = buildLede(data);

  // Pull-quote subject: highest-paid member; only meaningful when there's
  // actually been activity in the period.
  const topMember = data.members[0];
  const topMemberShare =
    topMember && data.totalSpent > 0
      ? Math.round((topMember.paid / data.totalSpent) * 100)
      : 0;

  const hasActivity = data.expenseCount > 0;

  return (
    <ViewTransition default="none">
      <div className="report-stage" style={{ viewTransitionName: "screen" }}>
        <ReportToolbar range={range} presetId={presetId} />

        <article className="sheet" id="report-sheet">
          {/* Masthead */}
          <header className="masthead">
            <div className="wordmark">
              <span className="leaf" aria-hidden>
                <I.leaf size={11} stroke="currentColor" sw={1.8} />
              </span>
              Farm Share Ledger
            </div>
            <div className="meta">
              <div>{data.tenantName}</div>
              <div>Generated {generated}</div>
            </div>
          </header>

          {/* Title block */}
          <section className="title-block">
            <div className="eyebrow">
              {range.kind === "monthly" ? "Monthly statement" : "Ad-hoc report"} · {range.label}
            </div>
            <h1>
              {range.kind === "monthly" ? (
                <>
                  A month at <em>{data.tenantName}</em>.
                </>
              ) : (
                <>
                  The story of <em>{range.label.toLowerCase()}</em>.
                </>
              )}
            </h1>
            <p className="lede">{lede}</p>
          </section>

          {hasActivity ? (
            <>
              {/* Hero */}
              <section className="hero">
                <div className="hero-cell">
                  <div className="eyebrow">Total spent</div>
                  <div className="num">{formatInr(data.totalSpent)}</div>
                  <div className="sub">
                    {data.expenseCount} {data.expenseCount === 1 ? "entry" : "entries"} ·{" "}
                    {data.groups.length} {data.groups.length === 1 ? "group" : "groups"}
                  </div>
                </div>
                <div className="hero-cell pos">
                  <div className="eyebrow">Total to settle</div>
                  <div className="num">{formatInr(data.totalToSettle)}</div>
                  <div className="sub">
                    {data.settlements.length}{" "}
                    {data.settlements.length === 1 ? "transfer" : "transfers"} · simplified
                  </div>
                </div>
                <div className={`hero-cell ${myPositionTone}`}>
                  <div className="eyebrow">Your position</div>
                  <div className="num">
                    {myNet >= 0 ? "+" : "−"}
                    {formatInr(Math.abs(myNet))}
                  </div>
                  <div className="sub">
                    {myNet >= 0 ? "Owed back to you" : "You owe others"}
                  </div>
                </div>
              </section>

              {/* §1 Top expenses */}
              <div className="section">
                <div className="kicker">
                  <span className="num">1</span> Top expenses
                </div>
                <h2>
                  The <em>{data.topExpenses.length === 5 ? "five lines" : "lines"}</em> that moved
                  the most money.
                </h2>
                <p className="intro">
                  Ranked by amount. The largest expense of {range.label} was logged by{" "}
                  {firstName(data.topExpenses[0]?.paidByName)} for{" "}
                  {data.topExpenses[0]?.description.toLowerCase()}.
                </p>
              </div>
              <div className="expense-rows">
                {data.topExpenses.map((e, i) => (
                  <div key={e.id} className="expense-row">
                    <span className="rank">{String(i + 1).padStart(2, "0")}</span>
                    <div className="body">
                      <div className="desc">{e.description}</div>
                      <div className="meta">
                        <span>{firstName(e.paidByName)} paid</span>
                        <span>{e.groupName}</span>
                        <span>
                          {new Date(e.date).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </div>
                    </div>
                    <span className="amt">{formatInr(e.amount)}</span>
                  </div>
                ))}
              </div>

              {/* §2 Who paid what */}
              <div className="section">
                <div className="kicker">
                  <span className="num">2</span> Who paid what
                </div>
                <h2>
                  The <em>contributions</em> behind the totals.
                </h2>
                <p className="intro">
                  &ldquo;Paid&rdquo; is what each member put in this period; &ldquo;net&rdquo; is
                  what&rsquo;s left after their share of every expense is netted out.
                </p>
              </div>
              <div className="member-table">
                <div className="head">
                  <div></div>
                  <div>Member</div>
                  <div className="r">Share</div>
                  <div className="r">Paid</div>
                  <div>Share of payments</div>
                  <div className="r">Net</div>
                </div>
                {data.members.map((m) => {
                  const sharePct =
                    data.totalSpent > 0
                      ? Math.round((m.owesShare / data.totalSpent) * 100)
                      : 0;
                  return (
                    <div key={m.id} className="row">
                      <div>
                        <Avatar id={m.id} name={m.name} size={28} />
                      </div>
                      <div className="name">
                        {m.name}
                        {m.id === user.id ? (
                          <span
                            className="mono"
                            style={{
                              marginLeft: 6,
                              fontSize: 10,
                              color: "var(--ink-3)",
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                            }}
                          >
                            you
                          </span>
                        ) : null}
                      </div>
                      <div className="pct">{sharePct}%</div>
                      <div className="paid">{formatInr(m.paid)}</div>
                      <div>
                        <div className="share-track">
                          <div
                            className="fill"
                            style={{ width: `${Math.max(2, (m.paid / maxPaid) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className={`net ${m.net >= 0 ? "pos" : "neg"}`}>
                        {m.net >= 0 ? "+" : "−"}
                        {formatInr(Math.abs(m.net))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pull quote */}
              {topMember && topMember.paid > 0 && (
                <aside className="pull">
                  <p>
                    {firstName(topMember.name)} carried the most weight this period, putting in{" "}
                    <em>{formatInr(topMember.paid)}</em> — {topMemberShare}% of every rupee the
                    collective spent.
                  </p>
                  <div className="by">Observation · auto-generated</div>
                </aside>
              )}

              {/* §3 Settle up */}
              <div className="section">
                <div className="kicker">
                  <span className="num">3</span> Settle up
                </div>
                <h2>
                  Who pays <em>whom</em>.
                </h2>
                <p className="intro">
                  The simplest way to make everyone whole after this period. Computed by netting
                  each member&rsquo;s contributions against their share, then collapsing pairs into
                  the fewest possible transfers.
                </p>
              </div>
              {data.settlements.length === 0 ? (
                <div className="square-card">
                  <div className="big">All square.</div>
                  <div className="sub">No transfers needed for {range.label}.</div>
                </div>
              ) : (
                <div className="settle-card">
                  <div className="settle-head">
                    <span />
                    <span>From</span>
                    <span />
                    <span />
                    <span>To</span>
                    <span className="r">Amount</span>
                  </div>
                  {data.settlements.map((t, i) => (
                    <div key={i} className="settle-row">
                      <Avatar id={t.fromId} name={t.fromName} size={32} />
                      <div className="nm from">
                        {firstName(t.fromName)}
                        {t.fromId === user.id ? " (you)" : ""}
                      </div>
                      <div className="arrow" aria-hidden>
                        <svg
                          width="18"
                          height="10"
                          viewBox="0 0 24 14"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M0 7h22M16 1l6 6-6 6" />
                        </svg>
                      </div>
                      <Avatar id={t.toId} name={t.toName} size={32} />
                      <div className="nm to">
                        {firstName(t.toName)}
                        {t.toId === user.id ? " (you)" : ""}
                      </div>
                      <div className="amt">{formatInr(t.amount)}</div>
                    </div>
                  ))}
                  <div className="settle-foot">
                    <span>
                      {data.settlements.length}{" "}
                      {data.settlements.length === 1 ? "transfer" : "transfers"} · simplified
                    </span>
                    <span>
                      Total to settle:{" "}
                      <span style={{ color: "var(--ink)", fontWeight: 600 }}>
                        {formatInr(data.totalToSettle)}
                      </span>
                    </span>
                  </div>
                </div>
              )}

              {/* §4 Group breakdown */}
              <div className="section">
                <div className="kicker">
                  <span className="num">4</span> Group breakdown
                </div>
                <h2>
                  Where the money <em>went</em>.
                </h2>
                <p className="intro">
                  Each active group&rsquo;s slice of the period, with the change versus the
                  immediately preceding window.
                </p>
              </div>
              <div className="group-grid">
                {data.groups.map((g) => (
                  <div key={g.id} className="group-card">
                    <div className="gc-head">
                      <div className="gc-name">{g.name}</div>
                      <div className="gc-tag">{g.tag}</div>
                    </div>
                    <div className="gc-num">{formatInr(g.total)}</div>
                    <div className="gc-meta">
                      {g.count} {g.count === 1 ? "entry" : "entries"} · {g.memberCount}{" "}
                      {g.memberCount === 1 ? "member" : "members"}
                    </div>
                    <div className="gc-bar">
                      <div className="f" style={{ width: `${g.sharePct}%` }} />
                    </div>
                    <div className="gc-foot">
                      <span>{Math.round(g.sharePct)}% of total</span>
                      <span
                        className={`delta ${g.deltaPct === 0 ? "" : g.deltaPct > 0 ? "up" : "down"}`}
                      >
                        {g.prevTotal === 0
                          ? "no prior window"
                          : `${g.deltaPct >= 0 ? "▲" : "▼"} ${Math.abs(g.deltaPct)}% vs prior`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">
              No expenses recorded in {range.label}. Pick a different range from the toolbar above.
            </div>
          )}

          {/* Footer */}
          <footer className="sheet-footer">
            <div>
              <div>Page 1 of 1 · Auto-generated by Farm Share Ledger</div>
              <div className="mono sub">
                Sent monthly to all members. Balances are derived from the ledger and never altered
                retroactively.
              </div>
            </div>
            <div className="stamp">
              <span className="dot" />
              Audited · immutable
            </div>
          </footer>
        </article>
      </div>
    </ViewTransition>
  );
}

function firstName(name: string | null | undefined): string {
  if (!name) return "—";
  return name.trim().split(/\s+/)[0];
}

function buildLede(data: {
  totalSpent: number;
  groups: { name: string }[];
  topExpenses: { description: string }[];
  myStat: { net: number } | null;
  range: ReportRange;
  expenseCount: number;
}) {
  if (data.expenseCount === 0) {
    return (
      <>
        Nothing was logged between <strong>{data.range.start}</strong> and{" "}
        <strong>{data.range.end}</strong>. A quiet patch — or perhaps a chance to catch up on the
        ledger.
      </>
    );
  }
  const topDesc = data.topExpenses[0]?.description ?? "one big purchase";
  const myNet = data.myStat?.net ?? 0;
  const ahead = myNet >= 0;

  if (data.range.kind === "monthly") {
    return (
      <>
        The collective spent <strong>{formatInr(data.totalSpent)}</strong> across{" "}
        <strong>{data.groups.length}</strong>{" "}
        {data.groups.length === 1 ? "active group" : "active groups"}, with{" "}
        <strong>{topDesc}</strong> as the single largest line. By plan, you came out{" "}
        <strong>
          {formatInr(Math.abs(myNet))} {ahead ? "ahead" : "behind"}
        </strong>
        .
      </>
    );
  }
  return (
    <>
      Between <strong>{data.range.start}</strong> and <strong>{data.range.end}</strong>, the
      collective recorded <strong>{data.expenseCount}</strong>{" "}
      {data.expenseCount === 1 ? "expense" : "expenses"} totalling{" "}
      <strong>{formatInr(data.totalSpent)}</strong>. Here is what unfolded.
    </>
  );
}
