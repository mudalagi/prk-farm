import { describe, expect, it } from "vitest";
import {
  buildSettlements,
  customRange,
  rangeForPreset,
  type ReportMember,
} from "../report-data";

// "now" anchors every preset case so the tests don't drift with the
// system clock.
const NOW = new Date("2026-04-18T10:00:00Z");

describe("rangeForPreset", () => {
  it("last-month resolves to the previous calendar month with kind=monthly", () => {
    expect(rangeForPreset("last-month", NOW)).toMatchObject({
      start: "2026-03-01",
      end: "2026-03-31",
      kind: "monthly",
    });
  });

  it("this-month runs from the 1st to today (to-date)", () => {
    const r = rangeForPreset("this-month", NOW);
    expect(r.start).toBe("2026-04-01");
    expect(r.end).toBe("2026-04-18");
    expect(r.kind).toBe("adhoc");
    expect(r.label).toMatch(/April 2026 · to date/);
  });

  it("ytd starts on Jan 1 of the current year", () => {
    expect(rangeForPreset("ytd", NOW)).toMatchObject({
      start: "2026-01-01",
      end: "2026-04-18",
      kind: "adhoc",
    });
  });

  it("this-quarter snaps to the calendar quarter start", () => {
    // April is Q2 (months 3,4,5 are Q2 with zero-indexed months 3..5).
    // Our impl uses floor(month/3) so Apr (month=3) → q=1 → April 1.
    expect(rangeForPreset("this-quarter", NOW)).toMatchObject({
      start: "2026-04-01",
      end: "2026-04-18",
      kind: "adhoc",
    });
    // January (month=0) should snap to Q1 start (Jan 1).
    const jan = new Date("2026-01-15T10:00:00Z");
    expect(rangeForPreset("this-quarter", jan).start).toBe("2026-01-01");
  });

  it("last-week is the previous Mon..Sun window", () => {
    // 2026-04-18 is a Saturday. Previous Mon..Sun = Apr 6..Apr 12.
    expect(rangeForPreset("last-week", NOW)).toMatchObject({
      start: "2026-04-06",
      end: "2026-04-12",
      kind: "adhoc",
    });
  });
});

describe("customRange", () => {
  it("builds a same-month label", () => {
    const r = customRange("2026-04-01", "2026-04-15");
    expect(r.kind).toBe("adhoc");
    expect(r.start).toBe("2026-04-01");
    expect(r.end).toBe("2026-04-15");
    // Just confirm we built *some* label without raising; the exact
    // formatting depends on the runtime locale (en-IN).
    expect(r.label.length).toBeGreaterThan(0);
  });

  it("builds a cross-month label", () => {
    const r = customRange("2026-03-20", "2026-04-15");
    expect(r.label).toMatch(/–|-/); // separator present
  });
});

describe("buildSettlements (greedy debt simplification)", () => {
  const m = (id: string, net: number): ReportMember => ({
    id,
    name: `User ${id}`,
    paid: 0,
    owesShare: 0,
    net,
  });

  it("clears one debtor against one creditor with a single transfer", () => {
    const out = buildSettlements([m("a", -500), m("b", 500)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ fromId: "a", toId: "b", amount: 500 });
  });

  it("collapses many small debts into the fewest possible transfers", () => {
    // Total = 1000 owed; 600+400 from two creditors → at most 2 transfers
    const out = buildSettlements([
      m("d1", -700),
      m("d2", -300),
      m("c1", 600),
      m("c2", 400),
    ]);
    expect(out.length).toBeLessThanOrEqual(3);
    // Sum of transfer amounts equals total debt.
    const totalMoved = out.reduce((s, t) => s + t.amount, 0);
    expect(totalMoved).toBe(1000);
  });

  it("skips noise under ₹1 (zero-net members)", () => {
    const out = buildSettlements([m("a", 0.4), m("b", -0.6), m("c", 0.2)]);
    expect(out).toEqual([]);
  });

  it("returns an empty list when everyone is settled", () => {
    const out = buildSettlements([m("a", 0), m("b", 0), m("c", 0)]);
    expect(out).toEqual([]);
  });

  it("always routes money from debtor → creditor (not the other way)", () => {
    const out = buildSettlements([m("a", -100), m("b", 100)]);
    for (const t of out) {
      // The "from" side is the one with negative net; "to" with positive.
      expect(t.fromId).toBe("a");
      expect(t.toId).toBe("b");
    }
  });
});
