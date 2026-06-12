"use client";

import { useActionState, useState } from "react";
import { setOwnership, type GroupActionResult } from "@/actions/group";
import { MemberSearch } from "@/components/member-search";
import { OwnershipEditor } from "@/components/ownership-editor";

type Member = {
  userId: string;
  email: string;
  displayName: string;
  ownershipPct: number;
};

type Props = {
  groupId: string;
  initialMembers: Member[];
};

export function MembersForm({ groupId, initialMembers }: Props) {
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [state, formAction, pending] = useActionState<GroupActionResult, FormData>(
    setOwnership,
    undefined
  );

  const total = members.reduce((sum, m) => sum + m.ownershipPct, 0);
  const isValid = members.length > 0 && Math.abs(total - 100) < 0.01;

  return (
    <form action={formAction} className="mt-6 space-y-6">
      <input type="hidden" name="groupId" value={groupId} />

      <MemberSearch members={members} onChange={setMembers} />

      <OwnershipEditor members={members} onChange={setMembers} />

      <input
        type="hidden"
        name="allocations"
        value={JSON.stringify(members.map((m) => ({ userId: m.userId, pct: m.ownershipPct })))}
      />

      {state?.error && (
        <p className="text-sm text-terra">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending || !isValid}
        className="btn btn-primary btn-press w-full"
      >
        {pending ? "Saving…" : "Save members & ownership"}
      </button>
    </form>
  );
}
