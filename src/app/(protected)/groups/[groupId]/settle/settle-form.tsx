"use client";

import { useActionState, useState, useEffect } from "react";
import { recordSettlement, type SettlementResult } from "@/actions/settlement";

type Member = { id: string; name: string };

type Props = {
  groupId: string;
  members: Member[];
  currentUserId: string;
  balanceMap: Record<string, number>;
};

export function SettleForm({ groupId, members, currentUserId, balanceMap }: Props) {
  const [state, formAction, pending] = useActionState<SettlementResult, FormData>(
    recordSettlement,
    undefined
  );

  const defaultTo = members.find((m) => m.id !== currentUserId)?.id ?? "";

  const [fromId, setFromId] = useState(currentUserId);
  const [toId, setToId] = useState(defaultTo);
  const [amount, setAmount] = useState("");

  // Pre-fill amount when from/to changes.
  // group_balances stores ONE row per pair with net_amount > 0 (nets both directions).
  // Key format: "debtor_id:creditor_id" — from=debtor, to=creditor is the natural direction.
  // Also check the reverse so we surface the balance even if direction is flipped.
  useEffect(() => {
    const forward = balanceMap[`${fromId}:${toId}`]; // from owes to
    if (forward && forward > 0) {
      setAmount(String(forward));
    } else {
      setAmount("");
    }
  }, [fromId, toId, balanceMap]);

  const forwardBalance = balanceMap[`${fromId}:${toId}`]; // from owes to → natural settlement
  const reverseBalance = balanceMap[`${toId}:${fromId}`]; // to owes from → reversed direction
  const fromName = members.find((m) => m.id === fromId)?.name ?? "";
  const toName = members.find((m) => m.id === toId)?.name ?? "";

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <input type="hidden" name="groupId" value={groupId} />

      <div>
        <label htmlFor="fromId" className="section-label mb-2 block">From (who is paying)</label>
        <select
          id="fromId"
          name="fromId"
          required
          value={fromId}
          onChange={(e) => setFromId(e.target.value)}
          className="input-warm"
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="toId" className="section-label mb-2 block">To (who is receiving)</label>
        <select
          id="toId"
          name="toId"
          required
          value={toId}
          onChange={(e) => setToId(e.target.value)}
          className="input-warm"
        >
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
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="input-warm"
        />
        {fromId === toId && (
          <p style={{ fontSize: 12, color: "var(--neg)", marginTop: 6 }}>
            From and To must be different members.
          </p>
        )}
        {fromId !== toId && forwardBalance && forwardBalance > 0 && (
          <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6, lineHeight: 1.4 }}>
            Outstanding: {fromName} owes {toName}{" "}
            <span style={{ color: "var(--accent)", fontWeight: 500 }}>
              ₹{forwardBalance.toLocaleString("en-IN")}
            </span>
          </p>
        )}
        {fromId !== toId && !forwardBalance && reverseBalance && reverseBalance > 0 && (
          <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6, lineHeight: 1.4 }}>
            Outstanding:{" "}
            <span style={{ color: "var(--accent)", fontWeight: 500 }}>
              {toName} owes {fromName} ₹{reverseBalance.toLocaleString("en-IN")}
            </span>
            {" "}— consider swapping From / To.
          </p>
        )}
        {fromId !== toId && !forwardBalance && !reverseBalance && (
          <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>
            No outstanding balance between these members.
          </p>
        )}
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

      <button
        type="submit"
        disabled={pending || fromId === toId}
        className="btn btn-primary btn-press w-full"
      >
        {pending ? "Recording…" : "Record settlement"}
      </button>
    </form>
  );
}
