"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { getActiveTenantId } from "@/lib/tenant";
import { canManageTenant } from "@/lib/platform";
import type { Tag } from "@/lib/types";

export type CreateTagResult = { tag: Tag } | { error: string };
export type UpdateTagResult = { tag: Tag } | { error: string };

export async function createTagAction(
  tenantId: string,
  name: string,
  color: string
): Promise<CreateTagResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Tag name is required" };
  if (trimmed.length > 32) return { error: "Tag name must be 32 characters or fewer" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tags")
    .insert({ tenant_id: tenantId, name: trimmed, color, created_by: user.id })
    .select()
    .single();

  if (error) {
    // Unique constraint violation — tag already exists; return the existing one.
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("tags")
        .select()
        .eq("tenant_id", tenantId)
        .ilike("name", trimmed)
        .single();
      if (existing) return { tag: existing as Tag };
    }
    return { error: error.message };
  }

  return { tag: data as Tag };
}

export async function updateTagAction(
  tagId: string,
  name: string,
  color: string
): Promise<UpdateTagResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const tenantId = await getActiveTenantId();
  if (!tenantId) return { error: "No active tenant" };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Tag name is required" };
  if (trimmed.length > 32) return { error: "Tag name must be 32 characters or fewer" };

  // Verify the tag belongs to this tenant and the user has permission.
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("tags")
    .select("id, created_by")
    .eq("id", tagId)
    .eq("tenant_id", tenantId)
    .single();

  if (!existing) return { error: "Tag not found" };

  const isAdmin = await canManageTenant(tenantId);
  if (!isAdmin && existing.created_by !== user.id) {
    return { error: "Only the tag creator or an admin can edit this tag" };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tags")
    .update({ name: trimmed, color })
    .eq("id", tagId)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return { error: "A tag with that name already exists" };
    return { error: error.message };
  }

  return { tag: data as Tag };
}

export async function deleteTagAction(tagId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const tenantId = await getActiveTenantId();
  if (!tenantId) return { error: "No active tenant" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tags")
    .delete()
    .eq("id", tagId)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };
  return {};
}
