"use client";

import { useActionState } from "react";
import { updateGroup, type GroupActionResult } from "@/actions/group";

type Props = { groupId: string; groupName: string };

export function EditGroupForm({ groupId, groupName }: Props) {
  const [state, formAction, pending] = useActionState<GroupActionResult, FormData>(
    updateGroup,
    undefined
  );

  return (
    <section className="card-surface p-5">
      <p className="eyebrow mb-3">Group name</p>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="groupId" value={groupId} />
        <input
          type="text"
          id="name"
          name="name"
          required
          defaultValue={groupName}
          className="input-warm w-full"
          placeholder="e.g. Crop Season 2026"
        />
        {state?.error && <p className="text-sm text-terra">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary btn-press w-full justify-center"
        >
          {pending ? "Saving…" : "Rename group"}
        </button>
      </form>
    </section>
  );
}
