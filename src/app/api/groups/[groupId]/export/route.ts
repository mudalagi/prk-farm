// Force Node.js runtime — pdfkit and xlsx are not Edge-compatible.
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getActiveTenantId } from "@/lib/tenant";
import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

type Member = {
  id: string;
  display_name: string;
  email: string;
  ownership_pct: number;
};

type Split = { user_id: string; share_pct: number; share_amount: number };

type Expense = {
  id: string;
  description: string;
  amount: number;
  date: string;
  paid_by: string;
  created_by: string;
  created_at: string;
  updated_at: string | null;
  splits: Split[];
  tag_ids: string[];
};

type TagMeta = { id: string; name: string; color: string };

type ExportData = {
  group: { id: string; name: string };
  tenantId: string;
  members: Member[];
  tags: TagMeta[];
  expenses: Expense[];
};

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchExportData(
  groupId: string,
  tenantId: string,
  ids: string[] | null
): Promise<ExportData | null> {
  const supabase = await createClient();

  const { data: group } = await supabase
    .from("groups")
    .select("id, name")
    .eq("id", groupId)
    .eq("tenant_id", tenantId)
    .single();

  if (!group) return null;

  type MemberRaw = {
    user_id: string;
    ownership_pct: number;
    profiles: { id: string; display_name: string; email: string } | null;
  };
  const { data: membersRaw } = await supabase
    .from("group_members")
    .select("user_id, ownership_pct, profiles(id, display_name, email)")
    .eq("group_id", groupId);

  const members: Member[] = ((membersRaw ?? []) as unknown as MemberRaw[]).map(
    (m) => ({
      id: m.user_id,
      display_name: m.profiles?.display_name ?? "Unknown",
      email: m.profiles?.email ?? "",
      ownership_pct: Number(m.ownership_pct),
    })
  );

  type ExpenseRaw = {
    id: string;
    description: string;
    amount: number;
    date: string;
    paid_by: string;
    created_by: string;
    created_at: string;
    updated_at: string | null;
    expense_splits: { user_id: string; share_pct: number; share_amount: number }[];
    expense_tags: { tag_id: string }[];
  };

  let expensesQuery = supabase
    .from("expenses")
    .select(
      "id, description, amount, date, paid_by, created_by, created_at, updated_at, expense_splits(user_id, share_pct, share_amount), expense_tags(tag_id)"
    )
    .eq("group_id", groupId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (ids && ids.length > 0) expensesQuery = expensesQuery.in("id", ids);
  const { data: expensesRaw } = await expensesQuery;

  // Fallback without tags join if migration hasn't been applied yet.
  const expenses: Expense[] = ((expensesRaw ?? []) as unknown as ExpenseRaw[]).map(
    (e) => ({
      id: e.id,
      description: e.description,
      amount: Number(e.amount),
      date: e.date,
      paid_by: e.paid_by,
      created_by: e.created_by,
      created_at: e.created_at,
      updated_at: e.updated_at,
      splits: (e.expense_splits ?? []).map((s) => ({
        user_id: s.user_id,
        share_pct: Number(s.share_pct),
        share_amount: Number(s.share_amount),
      })),
      tag_ids: (e.expense_tags ?? []).map((et) => et.tag_id),
    })
  );

  const referencedTagIds = [...new Set(expenses.flatMap((e) => e.tag_ids))];
  const { data: tagsRaw } =
    referencedTagIds.length > 0
      ? await supabase.from("tags").select("id, name, color").in("id", referencedTagIds)
      : { data: [] };

  return {
    group: { id: group.id, name: group.name },
    tenantId,
    members,
    tags: (tagsRaw ?? []) as TagMeta[],
    expenses,
  };
}

// ---------------------------------------------------------------------------
// Format generators
// ---------------------------------------------------------------------------

function toJSON(data: ExportData): NextResponse {
  const payload = {
    version: 1,
    exported_at: new Date().toISOString(),
    ...data,
  };
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": buildDisposition(data.group.name, "json"),
    },
  });
}

function toCSV(data: ExportData): NextResponse {
  const { expenses, members, tags } = data;

  const memberById = new Map(members.map((m) => [m.id, m.display_name]));
  const tagById = new Map(tags.map((t) => [t.id, t.name]));

  // Section 1 — Expenses
  const expenseRows = [
    ["ID", "Date", "Description", "Amount (INR)", "Paid By", "Tags", "Created At"],
    ...expenses.map((e) => [
      e.id,
      e.date,
      e.description,
      e.amount.toFixed(2),
      memberById.get(e.paid_by) ?? e.paid_by,
      e.tag_ids.map((tid) => tagById.get(tid) ?? tid).join("; "),
      e.created_at,
    ]),
  ];

  // Section 2 — Splits
  const splitRows = [
    ["Expense ID", "Description", "Member", "Share %", "Share Amount (INR)"],
    ...expenses.flatMap((e) =>
      e.splits.map((s) => [
        e.id,
        e.description,
        memberById.get(s.user_id) ?? s.user_id,
        s.share_pct.toFixed(2),
        s.share_amount.toFixed(2),
      ])
    ),
  ];

  // Section 3 — Members
  const memberRows = [
    ["Name", "Email", "Ownership %"],
    ...members.map((m) => [m.display_name, m.email, m.ownership_pct.toFixed(2)]),
  ];

  const csv = [
    "## EXPENSES",
    rowsToCsv(expenseRows),
    "",
    "## SPLITS",
    rowsToCsv(splitRows),
    "",
    "## MEMBERS",
    rowsToCsv(memberRows),
  ].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": buildDisposition(data.group.name, "csv"),
    },
  });
}

function rowsToCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell);
          return s.includes(",") || s.includes('"') || s.includes("\n")
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        })
        .join(",")
    )
    .join("\n");
}

function toXLSX(data: ExportData): NextResponse {
  const { expenses, members, tags } = data;
  const memberById = new Map(members.map((m) => [m.id, m.display_name]));
  const tagById = new Map(tags.map((t) => [t.id, t.name]));

  const wb = XLSX.utils.book_new();

  // Sheet 1: Expenses
  const expenseSheet = XLSX.utils.aoa_to_sheet([
    ["ID", "Date", "Description", "Amount (INR)", "Paid By", "Tags", "Created At"],
    ...expenses.map((e) => [
      e.id,
      e.date,
      e.description,
      e.amount,
      memberById.get(e.paid_by) ?? e.paid_by,
      e.tag_ids.map((tid) => tagById.get(tid) ?? tid).join(", "),
      e.created_at,
    ]),
  ]);
  expenseSheet["!cols"] = [
    { wch: 36 }, { wch: 12 }, { wch: 40 }, { wch: 14 },
    { wch: 20 }, { wch: 30 }, { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, expenseSheet, "Expenses");

  // Sheet 2: Splits
  const splitSheet = XLSX.utils.aoa_to_sheet([
    ["Expense ID", "Description", "Member", "Share %", "Share Amount (INR)"],
    ...expenses.flatMap((e) =>
      e.splits.map((s) => [
        e.id,
        e.description,
        memberById.get(s.user_id) ?? s.user_id,
        s.share_pct,
        s.share_amount,
      ])
    ),
  ]);
  splitSheet["!cols"] = [
    { wch: 36 }, { wch: 40 }, { wch: 20 }, { wch: 10 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, splitSheet, "Splits");

  // Sheet 3: Members
  const memberSheet = XLSX.utils.aoa_to_sheet([
    ["Name", "Email", "Ownership %"],
    ...members.map((m) => [m.display_name, m.email, m.ownership_pct]),
  ]);
  memberSheet["!cols"] = [{ wch: 24 }, { wch: 32 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, memberSheet, "Members");

  // Sheet 4: Tags
  if (tags.length > 0) {
    const tagSheet = XLSX.utils.aoa_to_sheet([
      ["Name", "Color"],
      ...tags.map((t) => [t.name, t.color]),
    ]);
    tagSheet["!cols"] = [{ wch: 24 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, tagSheet, "Tags");
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": buildDisposition(data.group.name, "xlsx"),
    },
  });
}

async function toPDF(data: ExportData): Promise<NextResponse> {
  const { group, expenses, members, tags } = data;
  const memberById = new Map(members.map((m) => [m.id, m.display_name]));
  const tagById = new Map(tags.map((t) => [t.id, t.name]));

  const doc = new PDFDocument({ margin: 48, size: "A4" });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((res) => doc.on("end", res));

  const W = doc.page.width - 96; // usable width
  const GOLD = "#d4a853";
  const MUTED = "#888888";
  const DARK = "#111114";

  // Header
  doc.rect(0, 0, doc.page.width, 72).fill(DARK);
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(20).text(group.name, 48, 22);
  doc.fill(MUTED).font("Helvetica").fontSize(9)
    .text(`Expense Report  ·  Exported ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`, 48, 46);
  doc.moveDown(2.5);

  // Summary stats
  const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);
  const stats = [
    ["Total Expenses", expenses.length.toString()],
    ["Total Amount", `₹${totalAmount.toLocaleString("en-IN")}`],
    ["Members", members.length.toString()],
  ];
  const colW = W / stats.length;
  stats.forEach(([label, value], i) => {
    const x = 48 + i * colW;
    const y = doc.y;
    doc.fill(MUTED).font("Helvetica").fontSize(8).text(label.toUpperCase(), x, y, { width: colW });
    doc.fill("#333333").font("Helvetica-Bold").fontSize(15).text(value, x, y + 13, { width: colW });
  });
  doc.moveDown(2);

  // Members & ownership
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(11).text("MEMBERS & OWNERSHIP");
  doc.moveDown(0.4);
  members.forEach((m) => {
    doc.fill("#333333").font("Helvetica").fontSize(9)
      .text(m.display_name, 48, doc.y, { width: W * 0.5, continued: true })
      .fill(MUTED).text(`${m.ownership_pct}%`, { align: "right" });
  });
  doc.moveDown(1.5);

  // Expenses table
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(11).text("EXPENSES");
  doc.moveDown(0.4);

  const COL = { date: 48, desc: 110, amount: 340, paid: 440 };

  // Table header row
  doc.fill(MUTED).font("Helvetica-Bold").fontSize(8);
  doc.text("DATE", COL.date, doc.y, { width: 60 });
  doc.text("DESCRIPTION", COL.desc, doc.y - doc.currentLineHeight(), { width: 220 });
  doc.text("AMOUNT", COL.amount, doc.y - doc.currentLineHeight(), { width: 90, align: "right" });
  doc.text("PAID BY", COL.paid, doc.y - doc.currentLineHeight(), { width: 90 });
  doc.moveDown(0.5);

  doc.moveTo(48, doc.y).lineTo(48 + W, doc.y).strokeColor("#333333").lineWidth(0.5).stroke();
  doc.moveDown(0.3);

  // Expense rows
  expenses.forEach((e, i) => {
    if (doc.y > doc.page.height - 80) {
      doc.addPage();
      doc.moveDown(1);
    }

    const rowY = doc.y;
    const bg = i % 2 === 0 ? "#1a1a20" : null;
    if (bg) {
      doc.rect(44, rowY - 2, W + 8, 16).fill(bg);
    }

    const paidByName = memberById.get(e.paid_by) ?? e.paid_by;
    const tagNames = e.tag_ids.map((tid) => tagById.get(tid) ?? "").filter(Boolean).join(", ");
    const amountStr = `₹${e.amount.toLocaleString("en-IN")}`;
    const dateStr = new Date(e.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

    doc.fill("#cccccc").font("Helvetica").fontSize(8.5);
    doc.text(dateStr, COL.date, rowY, { width: 60 });
    doc.text(e.description, COL.desc, rowY, { width: 220 });
    doc.text(amountStr, COL.amount, rowY, { width: 90, align: "right" });
    doc.text(paidByName, COL.paid, rowY, { width: 90 });

    if (tagNames) {
      doc.fill(GOLD).fontSize(7).text(tagNames, COL.desc, rowY + 10, { width: 220 });
      doc.moveDown(0.2);
    }

    doc.moveDown(0.1);
  });

  // Footer
  doc.moveDown(2);
  doc.fill(MUTED).font("Helvetica").fontSize(8)
    .text(`Generated by Chukta Farm Share Ledger  ·  ${new Date().toISOString()}`, { align: "center" });

  doc.end();
  await done;

  return new NextResponse(new Uint8Array(Buffer.concat(chunks)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": buildDisposition(data.group.name, "pdf"),
    },
  });
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function buildDisposition(groupName: string, ext: string): string {
  const safe = groupName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const date = new Date().toISOString().slice(0, 10);
  return `attachment; filename="${safe}_expenses_${date}.${ext}"`;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "json";
  const idsRaw = url.searchParams.get("ids");
  const ids = idsRaw ? idsRaw.split(",").filter(Boolean) : null;

  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const tenantId = await getActiveTenantId();
  if (!tenantId)
    return NextResponse.json({ error: "No active tenant" }, { status: 400 });

  const data = await fetchExportData(groupId, tenantId, ids);
  if (!data)
    return NextResponse.json({ error: "Group not found" }, { status: 404 });

  switch (format) {
    case "csv":  return toCSV(data);
    case "xlsx": return toXLSX(data);
    case "pdf":  return toPDF(data);
    default:     return toJSON(data);
  }
}
