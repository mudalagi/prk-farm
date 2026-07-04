// GET + POST /api/email/monthly-report
// Called by Vercel Cron (GET) on the 1st of each month.
// Can also be triggered manually via POST.
// Sends a personalised Farm Share Ledger email to every tenant member.
//
// Required env vars:
//   CRON_SECRET        — shared secret; must match Authorization header
//   RESEND_API_KEY     — Resend API key
//   EMAIL_FROM         — "From" address (must be verified with Resend, e.g. "Chukta <no-reply@chukta.in>")
//
// Optional env vars:
//   EMAIL_DRY_RUN=true — log emails instead of sending them (for testing)

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchReportData, rangeForPreset } from "@/app/(protected)/reports/report-data";
import { buildMonthlyEmail } from "@/lib/email-template";

export const runtime = "nodejs";
// Allow up to 5 minutes — tenants with many members need time to batch-send.
export const maxDuration = 300;

type ProfileRow = { id: string; email: string; display_name: string };

export async function POST(req: NextRequest) {
  // Verify the cron secret.
  const auth = req.headers.get("Authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = process.env.EMAIL_DRY_RUN === "true";
  const fromAddress = process.env.EMAIL_FROM ?? "Farm Share Ledger <no-reply@chukta.in>";
  const resend = dryRun ? null : new Resend(process.env.RESEND_API_KEY!);

  const admin = createAdminClient();
  const range = rangeForPreset("last-month");

  // Fetch all tenants.
  const { data: tenants, error: tenantsErr } = await admin.from("tenants").select("id, name");
  if (tenantsErr || !tenants) {
    console.error("Failed to fetch tenants", tenantsErr);
    return NextResponse.json({ error: "Failed to fetch tenants" }, { status: 500 });
  }

  const results: { tenantId: string; sent: number; skipped: number; errors: string[] }[] = [];

  for (const tenant of tenants) {
    // Fetch members with their email addresses via profiles.
    const { data: members, error: membersErr } = await admin
      .from("tenant_members")
      .select("user_id, profiles(id, email, display_name)")
      .eq("tenant_id", tenant.id);

    if (membersErr || !members) {
      results.push({ tenantId: tenant.id, sent: 0, skipped: 0, errors: ["Failed to fetch members"] });
      continue;
    }

    type MemberRow = { user_id: string; profiles: ProfileRow | null };
    const profiles: ProfileRow[] = (members as unknown as MemberRow[])
      .map((m) => m.profiles)
      .filter((p): p is ProfileRow => p !== null && !!p.email);

    if (profiles.length === 0) {
      results.push({ tenantId: tenant.id, sent: 0, skipped: 0, errors: [] });
      continue;
    }

    // Fetch the report once per tenant (shared data; personalisation happens per-member).
    let reportData;
    try {
      // Use the first member's id as the "current user" for the myStat field;
      // we'll override it per-member in buildMonthlyEmail.
      reportData = await fetchReportData(tenant.id, range, profiles[0].id, admin);
    } catch (err) {
      console.error(`Report fetch failed for tenant ${tenant.id}`, err);
      results.push({ tenantId: tenant.id, sent: 0, skipped: 0, errors: ["Report fetch failed"] });
      continue;
    }

    // Skip tenants with no activity in the period.
    if (reportData.expenseCount === 0) {
      results.push({ tenantId: tenant.id, sent: 0, skipped: profiles.length, errors: [] });
      continue;
    }

    let sent = 0;
    const errors: string[] = [];

    for (const profile of profiles) {
      const { subject, html } = buildMonthlyEmail(
        { ...reportData, myStat: reportData.members.find((m) => m.id === profile.id) ?? null },
        profile.id,
      );

      if (dryRun) {
        console.log(`[DRY RUN] To: ${profile.email} | Subject: ${subject}`);
        sent++;
        continue;
      }

      try {
        const { error } = await resend!.emails.send({
          from: fromAddress,
          to: profile.email,
          subject,
          html,
        });
        if (error) {
          errors.push(`${profile.email}: ${error.message}`);
        } else {
          sent++;
        }
      } catch (err) {
        errors.push(`${profile.email}: ${String(err)}`);
      }
    }

    results.push({ tenantId: tenant.id, sent, skipped: 0, errors });
  }

  const totalSent = results.reduce((s, r) => s + r.sent, 0);
  console.log(`Monthly email job complete — ${totalSent} emails sent`, JSON.stringify(results));

  return NextResponse.json({ ok: true, range: range.label, results });
}

// Vercel Cron fires GET requests; delegate to the same handler.
export async function GET(req: NextRequest) {
  return POST(req);
}
