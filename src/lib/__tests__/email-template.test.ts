import { describe, expect, it } from "vitest";
import { buildMonthlyEmail } from "../email-template";
import type { ReportData } from "@/app/(protected)/reports/report-data";

function makeReport(overrides: Partial<ReportData> = {}): ReportData {
  return {
    tenantName: "Test Farm",
    range: { start: "2026-06-01", end: "2026-06-30", label: "June 2026", kind: "monthly" },
    totalSpent: 10000,
    totalToSettle: 2000,
    myStat: { id: "u1", name: "Alice", paid: 6000, owesShare: 5000, net: 1000 },
    members: [
      { id: "u1", name: "Alice", paid: 6000, owesShare: 5000, net: 1000 },
      { id: "u2", name: "Bob", paid: 4000, owesShare: 5000, net: -1000 },
    ],
    topExpenses: [
      { id: "e1", description: "Fertilizer", amount: 5000, date: "2026-06-15", paidById: "u1", paidByName: "Alice", groupId: "g1", groupName: "Paddy" },
    ],
    groups: [
      { id: "g1", name: "Paddy", total: 10000, count: 2, memberCount: 2, sharePct: 100, prevTotal: 8000, deltaPct: 25, tag: "active" },
    ],
    settlements: [
      { fromId: "u2", fromName: "Bob", toId: "u1", toName: "Alice", amount: 1000 },
    ],
    tagStats: [],
    generatedAt: "2026-07-01T06:00:00.000Z",
    expenseCount: 2,
    ...overrides,
  };
}

describe("buildMonthlyEmail", () => {
  it("returns a subject containing the tenant name and period", () => {
    const { subject } = buildMonthlyEmail(makeReport(), "u1");
    expect(subject).toContain("Test Farm");
    expect(subject).toContain("June 2026");
  });

  it("produces HTML with doctype", () => {
    const { html } = buildMonthlyEmail(makeReport(), "u1");
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
  });

  it("includes the recipient's net position", () => {
    const { html } = buildMonthlyEmail(makeReport(), "u1");
    // Alice has net +1000
    expect(html).toContain("owed to you");
  });

  it("marks negative net for debtor", () => {
    const report = makeReport({ myStat: { id: "u2", name: "Bob", paid: 4000, owesShare: 5000, net: -1000 } });
    const { html } = buildMonthlyEmail(report, "u2");
    expect(html).toContain("you owe");
  });

  it("includes settlement rows only for the recipient", () => {
    const { html } = buildMonthlyEmail(makeReport(), "u2");
    // Bob owes Alice
    expect(html).toContain("You → Alice");
    expect(html).not.toContain("You → Bob");
  });

  it("includes top expense descriptions", () => {
    const { html } = buildMonthlyEmail(makeReport(), "u1");
    expect(html).toContain("Fertilizer");
  });

  it("includes group names", () => {
    const { html } = buildMonthlyEmail(makeReport(), "u1");
    expect(html).toContain("Paddy");
  });

  it("shows Alice's inward settlement as + when Bob owes her", () => {
    const { html } = buildMonthlyEmail(makeReport(), "u1");
    expect(html).toContain("Bob → You");
  });
});
