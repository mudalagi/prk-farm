"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getActiveTenantId } from "@/lib/tenant";
import { canManageTenant } from "@/lib/platform";
import { logAction } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type SettlementResult = { error: string } | undefined;

export async function recordSettlement(
  _prev: SettlementResult,
  formData: FormData
): Promise<SettlementResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const tenantId = await getActiveTenantId();
  if (!tenantId) return { error: "No active tenant" };

  const groupId   = formData.get("groupId") as string;
  const fromId    = formData.get("fromId") as string;
  const toId      = formData.get("toId") as string;
  const amount    = parseFloat(formData.get("amount") as string);
  const date      = formData.get("date") as string;
  const notes     = (formData.get("notes") as string).trim();

  if (!fromId || !toId || fromId === toId) return { error: "Select two different members" };
  if (!amount || amount <= 0) return { error: "Amount must be greater than zero" };
  if (!date) return { error: "Date is required" };

  // Any group member or admin can record a settlement.
  const supabase = await createClient();
  const isAdmin  = await canManageTenant(tenantId);

  if (!isAdmin) {
    // Must be one of the two parties.
    if (user.id !== fromId && user.id !== toId) {
      return { error: "You can only record settlements you are part of" };
    }
  }

  // Verify group belongs to this tenant.
  const { data: group } = await supabase
    .from("groups")
    .select("id")
    .eq("id", groupId)
    .eq("tenant_id", tenantId)
    .single();
  if (!group) return { error: "Group not found" };

  const admin = createAdminClient();
  const description = notes || `Settlement from ${fromId} to ${toId}`;

  // Insert settlement as an expense flagged is_settlement=true.
  const { data: expense, error: expErr } = await admin
    .from("expenses")
    .insert({
      group_id: groupId,
      description,
      amount,
      date,
      paid_by: fromId,
      created_by: user.id,
      is_settlement: true,
    })
    .select("id")
    .single();

  if (expErr || !expense) return { error: expErr?.message ?? "Failed to create settlement" };

  // Split: recipient (toId) owes 100% — this offsets the original debt in group_balances.
  const { error: splitErr } = await admin.from("expense_splits").insert({
    expense_id: expense.id,
    user_id: toId,
    share_pct: 100,
    share_amount: amount,
  });

  if (splitErr) return { error: splitErr.message };

  await logAction({
    tenantId,
    action: "settlement.recorded",
    resourceType: "expense",
    resourceId: expense.id,
    metadata: { fromId, toId, amount, date },
  });

  revalidatePath(`/groups/${groupId}`);
  redirect(`/groups/${groupId}`);
}
