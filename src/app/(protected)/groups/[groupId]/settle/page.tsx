import { requireUserAndTenant } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { I } from "@/components/ui/icons";
import { SettleForm } from "./settle-form";

export default async function SettlePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const { user, tenantId } = await requireUserAndTenant();

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
      .select("user_id, profiles(id, display_name)")
      .eq("group_id", groupId),
  ]);

  if (!groupRes.data) notFound();
  const group = groupRes.data;

  type MemberRaw = {
    user_id: string;
    profiles: { id: string; display_name: string } | null;
  };

  const members = ((membersRes.data ?? []) as unknown as MemberRaw[])
    .filter((m) => m.profiles)
    .map((m) => ({ id: m.user_id, name: m.profiles!.display_name }));

  return (
    <main className="mx-auto w-full max-w-[480px] px-5 sm:px-8 py-8 sm:py-10">
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

      <h1 className="font-display text-2xl font-bold text-ink">Record Settlement</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {group.name} · Record a direct payment between members. This adjusts
        balances without adding to total farm expenses.
      </p>

      <SettleForm groupId={groupId} members={members} currentUserId={user.id} />
    </main>
  );
}
