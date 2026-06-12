import { requireUserAndTenant } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canManageTenant } from "@/lib/platform";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { I } from "@/components/ui/icons";
import { MembersForm } from "./members-form";

export default async function GroupMembersPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const { tenantId } = await requireUserAndTenant();

  const isAdmin = await canManageTenant(tenantId);
  if (!isAdmin) redirect(`/groups/${groupId}`);

  const supabase = await createClient();

  const [groupRes, membersRes] = await Promise.all([
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
  ]);

  if (!groupRes.data) notFound();
  const group = groupRes.data;

  type MemberRaw = {
    user_id: string;
    ownership_pct: number;
    profiles: { id: string; display_name: string; email: string } | null;
  };

  const initialMembers = ((membersRes.data ?? []) as unknown as MemberRaw[])
    .filter((m) => m.profiles)
    .map((m) => ({
      userId: m.user_id,
      email: m.profiles!.email,
      displayName: m.profiles!.display_name,
      ownershipPct: Number(m.ownership_pct),
    }));

  return (
    <main className="mx-auto w-full max-w-[1120px] px-5 sm:px-8 py-8 sm:py-10">
      <Link
        href={`/groups/${groupId}`}
        className="mono"
        style={{
          color: "var(--ink-3)",
          fontSize: 12,
          textDecoration: "none",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 16,
        }}
      >
        <I.chevronL size={12} />
        Back
      </Link>

      <h1 className="font-display text-2xl font-bold text-ink">Members & Ownership</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {group.name} · Add or remove members and set ownership percentages.
      </p>

      <MembersForm groupId={groupId} initialMembers={initialMembers} />
    </main>
  );
}
