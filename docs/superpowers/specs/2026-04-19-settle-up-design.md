# Settle Up (v1) — Design

**Status:** approved for implementation
**Date:** 2026-04-19
**Author:** Raghavendra Bhat + Claude

## Problem

The app shows implied balances (who owes whom, computed from `expense_splits`) but has no way to record that a payment actually happened. The existing "Settle up" button is visual-only. Users can't close out debts, can't partially pay, and can't see a history of money that has actually moved.

## Goal (v1)

Let any group member record a payment from one member to another, including partial payments, with an optional receipt screenshot, and surface the history of those payments on the group and timeline pages. Update balances everywhere to reflect settlements.

## Decisions locked during brainstorming

| # | Decision | Rationale |
|---|---|---|
| 1 | Per-group settlements (option C), not per-expense | Matches group-scoped access control and keeps the model simple; receipts stay intelligible. |
| 2 | One-sided recording (Splitwise-style), no approval step | Matches existing trust model (anyone records an expense and everyone trusts the split). Brand line: "money divides, chukta settles." |
| 3 | Either participant (payer or recipient) can delete any time | Low-friction for a trusted co-owner group; recorded-by audit field still exists on every row. |
| 4 | Optional screenshot / PDF attachment | Users often capture UPI confirmations; surfaced as proof in history. |

## Data model

### New table: `public.settlements`

```sql
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  from_user uuid not null references public.profiles(id),
  to_user uuid not null references public.profiles(id),
  amount numeric(12,2) not null check (amount > 0),
  note text,
  receipt_path text,
  paid_at timestamptz not null default now(),
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (from_user != to_user)
);

create index settlements_group_idx on public.settlements(group_id);
create index settlements_from_idx  on public.settlements(from_user);
create index settlements_to_idx    on public.settlements(to_user);
```

- `receipt_path` is null when no attachment was uploaded, otherwise a path in the `settlement-receipts` Storage bucket.
- `paid_at` defaults to now() but is editable on record (user backdates a payment).
- `recorded_by` is always the authenticated user at record time and is never editable.

### New Storage bucket: `settlement-receipts`

- Private bucket.
- Path convention: `{group_id}/{settlement_id}/{filename}`. Filename is sanitized + uuid-prefixed on upload.
- Accepted MIME types: `image/*`, `application/pdf`.
- Size cap: 5 MB per file (enforced client-side for UX, and via Storage bucket config).

### Cascade cleanup

`after delete on settlements` trigger invokes `storage.delete_object('settlement-receipts', old.receipt_path)` when `old.receipt_path is not null`. This keeps receipt cleanup atomic with row deletion and removes the risk of orphaned Storage objects if a server action errors midway.

## Balance math

Extend the existing `group_balances` view to subtract settlements from the expense-derived nets.

Today (simplified):
```
debts           = per (group, creditor, debtor) sum of expense_splits.share_amount where user != payer
aggregated      = debts union the mirrored pair, nets to one directional row
group_balances  = aggregated filtered where net_amount > 0
```

New:
```
debts           = (unchanged)
payments        = per (group, creditor=to_user, debtor=from_user) sum of settlements.amount
aggregated      = debts union-all (payments as negative), summed per (group, creditor, debtor)
group_balances  = aggregated filtered where net_amount > 0
```

Because `group_balances` is a view, every downstream reader (balances page, `tenant_summary` function, dashboard summary, group-detail balance ribbon, settlement-plan block) picks up settlements automatically. No JS call sites change.

### Overpayment behaviour

If `sum(payments) > sum(debts)` for a pair, the direction flips naturally — the former recipient now owes the former payer the difference. This is the correct outcome and requires no special-casing; v1 does not block overpayment.

## Server actions

New file: `src/actions/settlement.ts`. Both actions use the `(prev, formData)` signature compatible with React 19's `useActionState`.

### `recordSettlement(prev, formData)`

Inputs (from `formData`): `group_id`, `to_user`, `amount` (string, parsed), optional `note`, optional `paid_at` (defaults server-side), optional `receipt` file.

Flow:
1. `requireUserAndTenant()` — authenticate + establish active tenant.
2. Verify `group_id` belongs to the active tenant and that both `from_user = auth.uid()` and `to_user` are members of that group. (Recording a payment *on behalf of* someone else is not supported in v1 — `from_user` is always the caller.)
3. Validate amount > 0 and parseable to 2 decimals.
4. Insert settlement row (without `receipt_path`), returning `id`.
5. If a receipt file was uploaded, upload to `settlement-receipts/{group_id}/{id}/{uuid}-{sanitized_filename}` and update the row with `receipt_path`. If upload fails, the row is deleted (compensating delete) and the action returns an error.
6. `revalidatePath` on `/balances`, `/timeline`, and the affected group detail page.

### `deleteSettlement(prev, formData)`

Inputs: `id`.

Flow:
1. `requireUserAndTenant()`.
2. Load settlement row; 404 if not found; 403 if caller is neither `from_user` nor `to_user`. (RLS also enforces this as a defense-in-depth layer.)
3. Delete the row. The `after delete` trigger removes the receipt from Storage.
4. `revalidatePath` on `/balances`, `/timeline`, and the affected group detail page.

### Edit is explicitly not supported in v1

To correct a mistake, delete and re-record. This keeps the audit trail honest and avoids a "history of history" problem.

## RLS

Following the existing pattern in `001_initial_schema.sql`:

```sql
alter table public.settlements enable row level security;

-- Read: any tenant member of the owning tenant (reuses get_group_tenant helper)
create policy settlements_select on public.settlements
  for select using (
    public.is_tenant_member(public.get_group_tenant(group_id))
  );

-- Insert: caller must be the payer and a member of the group
create policy settlements_insert on public.settlements
  for insert with check (
    from_user = auth.uid()
    and exists (
      select 1 from public.group_members gm
      where gm.group_id = settlements.group_id
        and gm.user_id = auth.uid()
    )
    and exists (
      select 1 from public.group_members gm
      where gm.group_id = settlements.group_id
        and gm.user_id = settlements.to_user
    )
  );

-- Delete: either participant
create policy settlements_delete on public.settlements
  for delete using (
    auth.uid() in (from_user, to_user)
  );
```

No update policy — updates are not allowed.

### Storage RLS for `settlement-receipts`

- Select: the authenticated user is a group member of the group referenced by the path prefix, **and** the settlement row exists (so deleting the row hides the receipt via RLS before the trigger fires).
- Insert: allowed only by the `recordSettlement` action flow; the policy mirrors settlements_insert by parsing the path prefix.
- Delete: allowed for `from_user` or `to_user` of the owning settlement row.

(Exact policy SQL will be in the migration; the shape above is load-bearing.)

## UI

### Settle-up sheet

New component `SettleUpSheet` in `src/components/settle-up-sheet.tsx`.

Props: `{ counterparty: { id, name }, defaultGroupId, groupOptions: { id, name, netOwed }[], onClose }`.

Fields:
- **Group** — if `groupOptions.length === 1`, shown as static text; otherwise a select, defaulting to the largest-debt group.
- **Amount** — prefilled with the net debt in the selected group, editable. Uses the same INR formatting as `src/lib/format.ts`.
- **Paid on** — date picker, defaults to today. (Lets people record yesterday's UPI.)
- **Note** — optional text, single line.
- **Attach receipt** — file input (image/pdf, ≤ 5 MB), with thumbnail preview and remove button.

Submit uses `useActionState(recordSettlement, null)`. Success closes the sheet; error shows the message inline.

The sheet follows the existing modal/bottom-sheet pattern in the codebase (check `group-detail-tabs.tsx` and CRED-dark theme tokens). Entry is animated via `<ViewTransition>`.

### Entry points

1. **Group detail page** — for each member with a non-zero balance against the current user, a "Settle up" button (or "Remind" if they owe you — existing copy) opens the sheet with `defaultGroupId` = this group.
2. **Balances page** — the existing `SettlementRow` component's dead "Settle up" button becomes live. It opens the sheet with `groupOptions` = the set of groups where the pair has a debt, `defaultGroupId` = largest-debt group. The "Remind" button for incoming debts stays out of scope for v1 (it currently does nothing either and is not part of this spec).

### Multi-group handling

If a pair's debt spans multiple groups, settling is **one group at a time**. The user can record the second group's settlement in a second submission. This keeps every settlement row tied to a real, user-chosen group (option C integrity). We explicitly reject auto-splitting a settlement across groups.

### History

**Group detail page** — new card "Payments" directly below the existing "Settlement plan" card. Rows show:
- avatar pair, "{from} paid {to}"
- amount (mono, tnum)
- paid-on date + note (truncated)
- receipt thumbnail (click to open Storage signed URL in a lightbox); falls back to a paperclip icon when absent
- delete button, visible only when the viewer is `from_user` or `to_user`

Empty state: "No payments yet."

**Timeline page** — settlements are interleaved with expense entries, ordered by `paid_at`. Visually distinct (different icon + accent color so they don't read like expenses). Filter affordance to hide settlements is out of scope for v1.

**Balances page** — not changed in v1. (Future: expand a counterparty row to show recent payments.)

## Security / validation summary

- Every server action validates group membership server-side before touching the DB; RLS is the authoritative backstop.
- Amounts parsed with `Number.parseFloat`, rejected if NaN, non-finite, ≤ 0, or > 10⁹.
- File type and size validated client-side for UX and server-side before Storage upload.
- Receipt URLs are signed and short-lived (e.g. 10 min) — never exposed as public URLs.

## Out of scope for v1

- Notifications (email/push) to the recipient when a payment is recorded or deleted.
- Editing a settlement (only delete + re-record).
- Overpayment blocking (the math handles direction flips correctly).
- Multi-currency.
- More than one attachment per settlement.
- Cross-group auto-allocation of a single settlement amount.
- Per-expense payment tracking (rejected in brainstorming as option B).
- A dedicated "reminder" flow for incoming debts.

## Migration + rollout

1. New migration file `008_settlements.sql` with table, indexes, trigger, RLS policies.
2. New Storage bucket + its RLS policies (via migration or app bootstrap, whichever matches existing conventions).
3. View replacement for `group_balances` in the same migration.
4. `src/actions/settlement.ts` + UI components in one feature branch.
5. No data backfill needed — existing expense-derived balances stay valid; new settlements simply start accumulating.

## Success criteria

- A user can click "Settle up", record a ₹200 partial payment with a screenshot, and see their remaining debt drop by ₹200 on the balances page, dashboard, and group detail page.
- Either the payer or the recipient can delete that settlement and the receipt is removed from Storage.
- All existing balance-reading code paths continue to work without modification.
- RLS prevents a user in tenant A from reading, inserting, or deleting settlements in tenant B.
