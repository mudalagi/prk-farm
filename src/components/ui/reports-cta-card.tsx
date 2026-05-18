import Link from "next/link";
import { I } from "./icons";

// Dashboard card that surfaces the monthly statement and gives the user
// a one-click download. "Download" navigates with ?print=1 so the report
// page fires the browser print dialog as soon as it paints.

function lastMonthLabel(): string {
  const now = new Date();
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return lastMonth.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function ReportsCtaCard() {
  const periodLabel = lastMonthLabel();
  return (
    <section
      className="card rise"
      style={{
        padding: "clamp(18px, 3vw, 26px) clamp(20px, 3.5vw, 28px)",
        marginBottom: 32,
        display: "flex",
        gap: 20,
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        position: "relative",
        overflow: "hidden",
      }}
      aria-labelledby="reports-cta-title"
    >
      <div
        className="mesh"
        style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.6 }}
        aria-hidden
      />
      <div style={{ flex: "1 1 280px", minWidth: 0, position: "relative" }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          Statement · {periodLabel}
        </div>
        <h2
          id="reports-cta-title"
          className="serif"
          style={{
            fontSize: "clamp(22px, 3.2vw, 28px)",
            lineHeight: 1.15,
            letterSpacing: "-0.015em",
            margin: 0,
            color: "var(--ink)",
          }}
        >
          Your monthly report is <em style={{ color: "var(--accent)", fontStyle: "italic" }}>ready</em>.
        </h2>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 13.5,
            color: "var(--ink-3)",
            lineHeight: 1.55,
            maxWidth: 460,
          }}
        >
          A printable summary of who paid what, who owes whom, and where the
          money went — for the period ending {periodLabel}.
        </p>
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          position: "relative",
        }}
      >
        <Link
          href="/reports?preset=last-month"
          className="btn btn-ghost"
          style={{ height: 38 }}
        >
          Preview
        </Link>
        <Link
          href="/reports?preset=last-month&print=1"
          className="btn btn-accent shimmer"
          style={{ height: 38 }}
          prefetch
        >
          <I.arrowDown size={13} /> Download PDF
        </Link>
      </div>
    </section>
  );
}
