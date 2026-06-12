"use client";

import { useActionState } from "react";
import { recordSettlement, type SettlementResult } from "@/actions/settlement";

type Member = { id: string; name: string };

type Props = {
  groupId: string;
  members: Member[];
  currentUserId: string;
};

export function SettleForm({ groupId, members, currentUserId }: Props) {
  const [state, formAction, pending] = useActionState<SettlementResult, FormData>(
    recordSettlement,
    undefined
  );

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <input type="hidden" name="groupId" value={groupId} />

      <div>
        <label htmlFor="fromId" className="section-label mb-2 block">From (who is paying)</label>
        <select
          id="fromId"
          name="fromId"
          required
          defaultValue={currentUserId}
          className="input-warm"
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="toId" className="section-label mb-2 block">To (who is receiving)</label>
        <select id="toId" name="toId" required className="input-warm">
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="amount" className="section-label mb-2 block">Amount (INR)</label>
        <input
          type="number"
          id="amount"
          name="amount"
          required
          min="0.01"
          step="0.01"
          placeholder="0.00"
          className="input-warm"
        />
      </div>

      <div>
        <label htmlFor="date" className="section-label mb-2 block">Date</label>
        <input
          type="date"
          id="date"
          name="date"
          required
          defaultValue={new Date().toISOString().split("T")[0]}
          className="input-warm"
        />
      </div>

      <div>
        <label htmlFor="notes" className="section-label mb-2 block">
          Notes <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>(optional)</span>
        </label>
        <input
          type="text"
          id="notes"
          name="notes"
          placeholder="e.g., UPI transfer for compound wall balance"
          className="input-warm"
        />
      </div>

      {state?.error && (
        <div className="rounded-xl bg-danger-wash border border-danger/10 px-4 py-3 text-[13px] text-danger">
          {state.error}
        </div>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary btn-press w-full">
        {pending ? "Recording…" : "Record settlement"}
      </button>
    </form>
  );
}
