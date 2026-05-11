# Platform admin · delete tenant

**Date:** 2026-05-11
**Status:** Approved (design phase)
**Owner:** raghavendra.b@safe.security

## Summary

Add the ability for a platform admin to delete a tenant and all of its
tenant-scoped resources from the existing `/platform` console. Deletion is
gated by typing the tenant's slug, runs as one server action, and relies on
existing `ON DELETE CASCADE` rules for most data fan-out. Orphaned auth users
(those whose only remaining reference was the deleted tenant) are cleaned up
using the same `deleteAuthUserIfOrphan` helper that powers `removeMember`.

## Goals

- Platform admins can delete any tenant from `/platform`.
- Deletion removes every tenant-scoped row: `tenant_domains`, `tenant_members`,
  `tenant_invites`, `groups`, `group_members`, `expenses`, `expense_splits`.
- Members who have no other tenants and no pending invites have their auth
  user removed. Members who still belong to other tenants are untouched.
- The deletion produces a single `tenant.deleted` audit entry with enough
  metadata (name, slug, primary domain, member count, actor) to reconstruct
  what happened.
- The tenant's slug and custom domain become reusable immediately after
  deletion.

## Non-goals

- Soft-delete / archive / restore. Deletion is final.
- A separate tenant detail page (`/platform/[tenantId]`). The action lives
  inline on the existing list.
- Bulk delete or scheduled deletion.
- Migrating data between tenants before deletion.

## Background

- `platform_admins` and `is_platform_admin()` already exist (migration 003).
- `/platform` already lists every tenant for platform admins, with onboarding.
- Foreign keys from `tenant_domains`, `tenant_members`, `tenant_invites`, and
  `groups` to `tenants(id)` are all `ON DELETE CASCADE`. Group cascades cover
  `group_members` and `expenses`, and `expenses` cascades to `expense_splits`.
- `audit_log.tenant_id` is `ON DELETE SET NULL` — audit entries survive
  tenant deletion automatically; we just need to write a final `tenant.deleted`
  row before/around the delete.
- `src/actions/admin.ts` defines a private `deleteAuthUserIfOrphan` helper that
  already checks for: remaining `tenant_members`, presence in `platform_admins`,
  and pending `tenant_invites` for the user's email. It only calls
  `admin.auth.admin.deleteUser` when none of those references exist.

## Architecture

One Server Action — `deleteTenant` — added to `src/actions/platform.ts`.
A small client dialog component invokes it from each row in the
`/platform` tenant list.

### Files

**New**
- `src/lib/auth-cleanup.ts` — module exporting `deleteAuthUserIfOrphan`.
  Lifted verbatim from `src/actions/admin.ts` so both `admin.ts` and the
  new `platform.ts` action can call the same implementation. No behavior
  change; the existing orphan rules (memberships, platform-admin row,
  pending invites) all stay.
- `src/app/platform/_components/delete-tenant-dialog.tsx` — client component.
  Renders the row-level trigger (kebab/`⋯` button), a modal with the
  type-the-slug input, and an inline error/success area driven by
  `useActionState`. Submit button stays disabled until the typed value
  equals the tenant slug exactly.

**Modified**
- `src/actions/admin.ts` — drop the local `deleteAuthUserIfOrphan` and
  import it from `@/lib/auth-cleanup`.
- `src/actions/platform.ts` — add `deleteTenant(prev, formData)` action.
- `src/app/platform/page.tsx` — render the new dialog component per row.
  Change `gridTemplateColumns` from `1fr 180px 120px` to
  `1fr 180px 120px 40px` and add a fourth header cell (blank) plus a
  trailing cell that mounts `<DeleteTenantDialog />`.

**No schema changes.** All cascading is already in place.

## Server action contract

```ts
// src/actions/platform.ts
export type DeleteTenantResult =
  | { ok: true; tenantId: string; slug: string }
  | { ok: false; error: string };

export type DeleteTenantActionState = DeleteTenantResult | undefined;

export async function deleteTenant(
  prev: DeleteTenantActionState,
  formData: FormData,
): Promise<DeleteTenantResult>;
```

`formData` fields:
- `tenant_id` (uuid, required)
- `confirm_slug` (string, required) — must equal the tenant's stored slug
  exactly (case-sensitive — slugs are already lowercase by schema).

## Execution flow

```
1. await isCurrentUserPlatformAdmin()       → false ⇒ { ok:false, error:"Not authorized." }
2. load tenant row (id, name, slug)         → null  ⇒ { ok:false, error:"Tenant no longer exists." }
3. confirm_slug !== tenant.slug             → true  ⇒ { ok:false, error:"Slug did not match." }
4. snapshot member user_ids   (SELECT user_id FROM tenant_members WHERE tenant_id = ?)
5. snapshot primary domain    (SELECT domain FROM tenant_domains WHERE tenant_id = ? AND is_primary)
6. DELETE FROM tenants WHERE id = ?         (cascade fans out)
   → on error: return Postgres error string; no partial cleanup needed
7. for each user_id in step-4 snapshot:
     await deleteAuthUserIfOrphan(admin, user_id)
     on failure: collect into failed_user_cleanups[]
8. await logAction({
     tenantId: null,
     action: "tenant.deleted",
     resourceType: "tenant",
     resourceId: <deleted tenant id>,
     metadata: {
       deleted_tenant_id, name, slug,
       primary_domain, member_count,
       failed_user_cleanups: string[]
     }
   })
9. revalidatePath("/platform")
10. return { ok: true, tenantId, slug }
```

### Why this ordering

- Member user_ids must be captured **before** the cascade, because once
  `tenant_members` rows are gone we cannot enumerate who lost access.
- Orphan cleanup runs **after** the cascade, because
  `deleteAuthUserIfOrphan` checks `tenant_members` count — that count must
  already exclude the deleted tenant.
- Audit logging runs **last** so the `failed_user_cleanups` list reflects
  the actual outcome. We pass `tenant_id: null` because the tenant is gone;
  metadata carries the original id for forensic traceability.

## Error handling

| Failure                            | Behavior                                                                                            |
| ---                                | ---                                                                                                 |
| Not a platform admin               | Action returns error; UI shows inline error; no audit write.                                        |
| Tenant already gone                | Action returns `Tenant no longer exists.`; UI still revalidates `/platform` to clear the stale row. |
| Slug mismatch                      | Action returns `Slug did not match.`; UI shouldn't allow this but checks defensively.               |
| `DELETE FROM tenants` fails        | Action returns raw Postgres error string. Cascade is atomic — partial state is impossible.          |
| `deleteAuthUserIfOrphan` per user  | Swallowed per user; failed user_id appended to `failed_user_cleanups` metadata. Action still ok.    |
| `logAction` returns null/errors    | Logged to console; action still returns ok. Audit failure is not a correctness failure.             |

A failed orphan cleanup leaves a stranded `auth.users` row with no profile
(profile cascaded away) and no memberships. The user can't sign in to anything
because there's no `tenant_members` row anywhere. The cleanup can be retried
manually with the `failed_user_cleanups` metadata.

## UI

**Trigger** — a small trailing `⋯` icon button on each tenant row in the
`/platform` table. Clicking opens the dialog.

**Dialog content**

```
Delete tenant

This permanently deletes "<tenant name>" and everything it owns:
groups, expenses, members, invites, and domains.

Members who don't belong to any other tenant will also have their
account removed.

Type the tenant slug to confirm: <slug>
[ _________________________ ]

[ Cancel ]  [ Delete tenant ]  ← disabled until typed value === slug
```

The Delete button is destructive-styled (red). After submission, while
the action is pending, the button shows a spinner and is disabled.
On error, the dialog shows the error inline and stays open. On success,
the dialog closes (the row is gone after revalidate, so the trigger
that opened it has unmounted — React handles this naturally).

## Security model

- Server gate: `isCurrentUserPlatformAdmin()` before any read or write.
- RLS gate: writes go through the admin (service-role) client, so RLS
  is bypassed by design — the platform-admin gate is the authoritative
  check.
- Confirmation gate: server re-verifies the typed slug against the
  stored slug. A platform admin who scripts the request directly still
  has to know the slug; a UI misfire still has to pass exact equality.
- Audit gate: every successful deletion writes one `tenant.deleted` row
  with the actor's user id (via `auth.uid()` inside `log_action`).

## Testing

### Unit (Vitest)

`src/lib/__tests__/auth-cleanup.test.ts`
- Mocks the supabase admin client.
- Three cases for `deleteAuthUserIfOrphan`:
  - User has another tenant membership → `deleteUser` NOT called.
  - User is a platform admin with no memberships → `deleteUser` NOT called.
  - User has no memberships, no platform-admin row, no pending invites →
    `deleteUser` IS called.

`src/actions/__tests__/platform-delete.test.ts`
- Mocks the supabase admin client + the platform-admin check.
- Cases:
  - Non-admin caller → returns `Not authorized.`, no db writes.
  - Slug mismatch → returns `Slug did not match.`, no db writes.
  - Happy path → calls `tenants.delete`, calls `deleteAuthUserIfOrphan`
    for every captured member, writes one audit entry, calls
    `revalidatePath("/platform")`.

### Integration (Playwright)

`tests/e2e/platform-delete-tenant.spec.ts`

1. Seed: create tenant `acme` with two members (owner + invitee), both
   exclusive to this tenant.
2. Sign in as a separate platform-admin user.
3. Visit `/platform`, locate the `acme` row, click delete trigger.
4. Type the wrong slug → assert Delete button stays disabled.
5. Type `acme` → click Delete → wait for redirect/revalidate.
6. Assert the row is gone.
7. Attempt to sign in as the former owner → assert failure (user removed).
8. Re-onboard a tenant with the same slug `acme` → assert success (slug
   freed).

## Out-of-band cleanup (operational note)

If `failed_user_cleanups` ever contains entries in production, the
remediation is to call `admin.auth.admin.deleteUser(id)` from a one-off
script for each id. The audit metadata carries everything needed.

## Open questions

None at sign-off. (Earlier draft flagged the orphan check + platform_admins
interaction; on re-read of `src/actions/admin.ts:41-46`, the existing
helper already treats a `platform_admins` row as "not orphan". Lifting
the helper into `src/lib/auth-cleanup.ts` therefore preserves behavior
rather than changing it.)
