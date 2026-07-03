import { requireUserAndTenant } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canManageTenant } from "@/lib/platform";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ViewTransition } from "react";
import { I } from "@/components/ui/icons";
import { EditGroupForm } from "./edit-group-form";
import { MembersSection } from "./members-section";
import { TagsSection } from "./tags-section";
import type { Tag } from "@/lib/types";

export default async function EditGroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const { tenantId } = await requireUserAndTenant();

  const isAdmin = await canManageTenant(tenantId);
  if (!isAdmin) redirect(`/groups/${groupId}`);

  const supabase = await createClient();

  const [groupRes, membersRes, tagsRes] = await Promise.all([
    supabase
      .from("groups")
      .select("id, name")
      .eq("id", groupId)
      .eq("tenant_id", tenantId)
      .single(),
    supabase
      .from("group_members")
      .select("user_id, ownership_pct, profiles(id, display_name, email)")
      .eq("group_id", groupId),
    supabase
      .from("tags")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("name"),
  ]);

  if (!groupRes.data) notFound();
  const group = groupRes.data;

  type MemberRaw = {
    user_id: string;
    ownership_pct: number;
    profiles: { id: string; display_name: string; email: string } | null;
  };

  const members = ((membersRes.data ?? []) as unknown as MemberRaw[])
    .filter((m) => m.profiles)
    .map((m) => ({
      userId: m.profiles!.id,
      email: m.profiles!.email,
      displayName: m.profiles!.display_name,
      ownershipPct: Number(m.ownership_pct),
    }));

  const tags = (tagsRes.data ?? []) as Tag[];

  return (
    <ViewTransition
      enter={{ "nav-forward": "slide-from-right", "nav-back": "slide-from-left", default: "none" }}
      exit={{ "nav-forward": "slide-to-left", "nav-back": "slide-to-right", default: "none" }}
      default="none"
    >
      <main className="mx-auto w-full max-w-[1120px] px-5 py-8 sm:px-8 sm:py-10">
        <Link
          href={`/groups/${group.id}`}
          className="mono inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.08em] text-ink-muted no-underline"
        >
          <I.chevronL size={12} />
          Back to group
        </Link>

        <div className="mt-5 mb-8">
          <p className="eyebrow mb-2">Group settings</p>
          <h1 className="serif m-0 text-[clamp(32px,5vw,48px)] leading-none tracking-[-0.025em] text-ink">
            {group.name}
          </h1>
        </div>

        {/* Two-column layout: members (wide) | name + tags (sidebar) */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Left: members */}
          <MembersSection groupId={groupId} initialMembers={members} />

          {/* Right: group name + tags */}
          <div className="flex flex-col gap-6">
            <EditGroupForm groupId={group.id} groupName={group.name} />
            <TagsSection tenantId={tenantId} initialTags={tags} />
          </div>
        </div>
      </main>
    </ViewTransition>
  );
}
