// HTML email template for the monthly Farm Share Ledger.
// Uses table-based layout and inline styles for email client compatibility.

import type { ReportData } from "@/app/(protected)/reports/report-data";

function inr(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}

export function buildMonthlyEmail(data: ReportData, recipientId: string): { subject: string; html: string } {
  const myStat = data.members.find((m) => m.id === recipientId) ?? null;
  const myNet = myStat?.net ?? 0;
  const mySettlements = data.settlements.filter((s) => s.fromId === recipientId || s.toId === recipientId);

  const accentColor = "#d4a853"; // warm gold from the UI theme
  const bg = "#050506";
  const cardBg = "#111114";
  const border = "#1c1c22";
  const inkDim = "#666";
  const inkDimmer = "#444";
  const pos = "#4ade80";
  const neg = "#f87171";

  const subject = `Farm Share Ledger — ${data.tenantName} · ${data.range.label}`;

  // Settlement rows for this recipient.
  const settlementRows = mySettlements
    .map((s) => {
      const fromMe = s.fromId === recipientId;
      return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid ${border};font-size:14px;color:#ccc;">
            ${fromMe ? `You → ${s.toName}` : `${s.fromName} → You`}
          </td>
          <td style="padding:10px 0;border-bottom:1px solid ${border};text-align:right;font-size:14px;font-weight:600;color:${fromMe ? neg : pos};font-family:monospace;">
            ${fromMe ? "−" : "+"}${inr(s.amount)}
          </td>
        </tr>`;
    })
    .join("");

  // Top 3 expenses.
  const topExpenseRows = data.topExpenses.slice(0, 3)
    .map(
      (e) => `
        <tr>
          <td style="padding:9px 0;border-bottom:1px solid ${border};font-size:13px;color:#ccc;">
            <div style="font-weight:500;">${e.description}</div>
            <div style="font-size:11px;color:${inkDim};margin-top:2px;">${firstName(e.paidByName)} paid · ${e.groupName}</div>
          </td>
          <td style="padding:9px 0;border-bottom:1px solid ${border};text-align:right;font-size:13px;font-weight:600;color:#ddd;font-family:monospace;">
            ${inr(e.amount)}
          </td>
        </tr>`,
    )
    .join("");

  // Per-group summary rows.
  const groupRows = data.groups
    .map(
      (g) => `
        <tr>
          <td style="padding:9px 0;border-bottom:1px solid ${border};font-size:13px;color:#ccc;">
            ${g.name}
            <span style="font-size:11px;color:${inkDim};margin-left:8px;">${g.count} entries</span>
          </td>
          <td style="padding:9px 0;border-bottom:1px solid ${border};text-align:right;font-size:13px;font-weight:600;color:#ddd;font-family:monospace;">
            ${inr(g.total)}
          </td>
        </tr>`,
    )
    .join("");

  const netColor = myNet > 0 ? pos : myNet < 0 ? neg : "#aaa";
  const netLabel = myNet > 0 ? `+${inr(myNet)} owed to you` : myNet < 0 ? `${inr(-myNet)} you owe` : "All square";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:${bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${bg};padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="padding-bottom:28px;">
            <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${inkDim};margin-bottom:6px;">
              Farm Share Ledger · ${data.tenantName}
            </div>
            <div style="font-size:28px;font-weight:700;color:#f0ebe3;letter-spacing:-0.02em;">
              ${data.range.label}
            </div>
          </td>
        </tr>

        <!-- Your position card -->
        <tr>
          <td style="padding-bottom:20px;">
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background:${cardBg};border:1px solid ${border};border-radius:14px;overflow:hidden;">
              <tr>
                <td style="padding:18px 20px;border-bottom:1px solid ${border};">
                  <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${inkDim};margin-bottom:6px;">Your position</div>
                  <div style="font-size:24px;font-weight:700;color:${netColor};font-family:monospace;">${netLabel}</div>
                </td>
              </tr>
              <tr>
                <td>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="50%" style="padding:14px 20px;border-right:1px solid ${border};">
                        <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:${inkDim};margin-bottom:4px;">You paid</div>
                        <div style="font-size:18px;font-weight:600;color:#ddd;font-family:monospace;">${inr(myStat?.paid ?? 0)}</div>
                      </td>
                      <td width="50%" style="padding:14px 20px;">
                        <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:${inkDim};margin-bottom:4px;">Your share</div>
                        <div style="font-size:18px;font-weight:600;color:#ddd;font-family:monospace;">${inr(myStat?.owesShare ?? 0)}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        ${mySettlements.length > 0 ? `
        <!-- Settlements for this recipient -->
        <tr>
          <td style="padding-bottom:20px;">
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background:${cardBg};border:1px solid ${border};border-radius:14px;overflow:hidden;">
              <tr>
                <td colspan="2" style="padding:14px 20px;border-bottom:1px solid ${border};">
                  <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${inkDim};">Settle up</div>
                </td>
              </tr>
              ${settlementRows}
              <tr>
                <td colspan="2" style="padding:0 0;border-bottom:0;height:1px;"></td>
              </tr>
            </table>
          </td>
        </tr>` : ""}

        <!-- Top expenses -->
        ${data.topExpenses.length > 0 ? `
        <tr>
          <td style="padding-bottom:20px;">
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background:${cardBg};border:1px solid ${border};border-radius:14px;overflow:hidden;">
              <tr>
                <td colspan="2" style="padding:14px 20px;border-bottom:1px solid ${border};">
                  <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${inkDim};">Top expenses</div>
                </td>
              </tr>
              <tr><td colspan="2" style="padding:0 20px;">${topExpenseRows ? `<table width="100%" cellpadding="0" cellspacing="0">${topExpenseRows}</table>` : ""}</td></tr>
            </table>
          </td>
        </tr>` : ""}

        <!-- Groups -->
        ${data.groups.length > 0 ? `
        <tr>
          <td style="padding-bottom:20px;">
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background:${cardBg};border:1px solid ${border};border-radius:14px;overflow:hidden;">
              <tr>
                <td colspan="2" style="padding:14px 20px;border-bottom:1px solid ${border};">
                  <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${inkDim};">Group summary</div>
                </td>
              </tr>
              <tr><td colspan="2" style="padding:0 20px;"><table width="100%" cellpadding="0" cellspacing="0">${groupRows}</table></td></tr>
              <tr>
                <td colspan="2" style="padding:12px 20px;border-top:1px solid ${border};">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-size:11px;color:${inkDim};">Total farm spend</td>
                      <td style="text-align:right;font-size:14px;font-weight:700;color:${accentColor};font-family:monospace;">${inr(data.totalSpent)}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>` : ""}

        <!-- Footer -->
        <tr>
          <td style="padding-top:12px;text-align:center;">
            <div style="font-size:11px;color:${inkDimmer};line-height:1.6;">
              Generated by <a href="https://prk.chukta.in" style="color:${inkDim};text-decoration:none;">Chukta · Farm Share Ledger</a><br/>
              You're receiving this because you're a member of <strong style="color:#888;">${data.tenantName}</strong>.
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
