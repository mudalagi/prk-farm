"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { getActiveTenantId } from "@/lib/tenant";
import { canManageTenant } from "@/lib/platform";
import { logAction } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type GroupActionResult = { error?: string } | void;

// Permission matrix (chukta):
//   createGroup   — any tenant member
//   updateGroup   — any tenant member (rename is low-stakes)
//   setOwnership  — tenant admin or platform admin (financial change)

export async function createGroup(
  _prev: GroupActionResult,
  formData: FormData,
): Promise<GroupActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const tenantId = await getActiveTenantId();
  if (!tenantId) return { error: "No active tenant" };

  const supabase = await createClient();

  // Any tenant member can create a group. RLS allowed this already, but we
  // double-check so we can fail with a clean error before writing anything.
  const { data: membership } = await supabase
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return { error: "You're not a member of this tenant." };

  const name = formData.get("name") as string;
  if (!name?.trim()) return { error: "Group name is required" };

  const membersJson = formData.get("members") as string;
  let members: { userId: string; ownershipPct: number }[];
  try {
    members = JSON.parse(membersJson);
  } catch {
    return { error: "Invalid members data" };
  }
  if (members.length === 0) return { error: "At least one member is required" };

  const total = members.reduce((sum, m) => sum + m.ownershipPct, 0);
  if (Math.abs(total - 100) > 0.01) {
    return { error: `Ownership must total 100%, got ${total}%` };
  }

  // Service-role writes so we don't depend on the (now always-false)
  // is_tenant_owner RLS branch. The membership check above is the gate.
  const admin = createAdminClient();
  const { data: group, error: groupError } = await admin
    .from("groups")
    .insert({ name: name.trim(), tenant_id: tenantId, created_by: user.id })
    .select()
    .single();
  if (groupError) return { error: groupError.message };

  const memberRows = members.map((m) => ({
    group_id: group.id,
    user_id: m.userId,
    ownership_pct: m.ownershipPct,
  }));
  const { error: membersError } = await admin.from("group_members").insert(memberRows);
  if (membersError) return { error: membersError.message };

  await logAction({
    tenantId,
    action: "group.created",
    resourceType: "group",
    resourceId: group.id,
    metadata: { name: name.trim(), member_count: members.length },
  });

  revalidatePath("/groups");
  redirect(`/groups/${group.id}`);
}

export async function updateGroup(
  _prev: GroupActionResult,
  formData: FormData,
): Promise<GroupActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const tenantId = await getActiveTenantId();
  if (!tenantId) return { error: "No active tenant" };

  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return { error: "You're not a member of this tenant." };

  const groupId = formData.get("groupId");
  if (typeof groupId !== "string" || !groupId.trim()) {
    return { error: "Group ID is required" };
  }

  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) {
    return { error: "Group name is required" };
  }

  const trimmedName = name.trim();
  const trimmedGroupId = groupId.trim();

  const admin = createAdminClient();
  const { data: group, error } = await admin
    .from("groups")
    .update({ name: trimmedName, updated_at: new Date().toISOString() })
    .eq("id", trimmedGroupId)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!group) return { error: "Group not found or does not belong to this tenant." };

  await logAction({
    tenantId,
    action: "group.renamed",
    resourceType: "group",
    resourceId: trimmedGroupId,
    metadata: { name: trimmedName },
  });

  revalidatePath(`/groups/${trimmedGroupId}`);
  revalidatePath(`/groups/${trimmedGroupId}/edit`);
  redirect(`/groups/${trimmedGroupId}`);
}

export async function setOwnership(
  _prev: GroupActionResult,
  formData: FormData,
): Promise<GroupActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const tenantId = await getActiveTenantId();
  if (!tenantId) return { error: "No active tenant" };

  if (!(await canManageTenant(tenantId))) {
    return { error: "Only a tenant admin can change ownership." };
  }

  const groupId = formData.get("groupId") as string;
  const allocationsJson = formData.get("allocations") as string;

  let allocations: { userId: string; pct: number }[];
  try {
    allocations = JSON.parse(allocationsJson);
  } catch {
    return { error: "Invalid allocations data" };
  }

  const total = allocations.reduce((sum, a) => sum + a.pct, 0);
  if (Math.abs(total - 100) > 0.01) {
    return { error: `Ownership must total 100%, got ${total}%` };
  }

  const admin = createAdminClient();
  const { error: deleteError } = await admin
    .from("group_members")
    .delete()
    .eq("group_id", groupId);
  if (deleteError) return { error: deleteError.message };

  const rows = allocations.map((a) => ({
    group_id: groupId,
    user_id: a.userId,
    ownership_pct: a.pct,
  }));
  const { error: insertError } = await admin.from("group_members").insert(rows);
  if (insertError) return { error: insertError.message };

  await logAction({
    tenantId,
    action: "group.ownership_updated",
    resourceType: "group",
    resourceId: groupId,
    metadata: { allocations },
  });

  revalidatePath(`/groups/${groupId}`);
  redirect(`/groups/${groupId}`);
}

export type MemberNameResult = { error?: string; success?: boolean };

export async function updateMemberDisplayName(
  memberId: string,
  name: string,
): Promise<MemberNameResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const tenantId = await getActiveTenantId();
  if (!tenantId) return { error: "No active tenant" };

  if (!(await canManageTenant(tenantId))) {
    return { error: "Only a tenant admin can edit member names" };
  }

  const trimmed = name.trim();
  if (!trimmed) return { error: "Name cannot be empty" };
  if (trimmed.length > 80) return { error: "Name must be 80 characters or fewer" };

  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", memberId)
    .maybeSingle();
  if (!membership) return { error: "Member not found in this tenant" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ display_name: trimmed })
    .eq("id", memberId);

  if (error) return { error: error.message };

  revalidatePath("/groups");
  return { success: true };
}
