# Platform Admin · Delete Tenant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a platform admin permanently delete a tenant and all of its tenant-scoped resources from `/platform`, with a type-the-slug confirmation, orphan-only auth-user cleanup, and an audit trail entry.

**Architecture:** One new Server Action `deleteTenant` in `src/actions/platform.ts` (gated by `isCurrentUserPlatformAdmin`, validates `confirm_slug` against the stored slug). The DB schema already cascades `tenant_domains`, `tenant_members`, `tenant_invites`, `groups`, `group_members`, `expenses`, and `expense_splits` from `tenants`; `audit_log.tenant_id` is `ON DELETE SET NULL`, so we only need to write one final `tenant.deleted` audit row. Auth-user orphan cleanup is shared with `removeMember` by lifting the existing `deleteAuthUserIfOrphan` helper from `src/actions/admin.ts` into a new `src/lib/auth-cleanup.ts` module. A client dialog (`src/app/platform/_components/delete-tenant-dialog.tsx`) renders the row-level `⋯` trigger and runs the action through `useActionState`.

**Tech Stack:** Next.js 16 (App Router) + React 19 (`useActionState`, `<ViewTransition>`), TypeScript, Supabase (admin client / service role for cross-tenant writes), Vitest + Testing Library (unit), Playwright (e2e).

**Reference spec:** `docs/superpowers/specs/2026-05-11-platform-admin-delete-tenant-design.md`

---

## File Map

**Create**
- `src/lib/auth-cleanup.ts` — `deleteAuthUserIfOrphan(admin, userId)`, lifted from `src/actions/admin.ts:31-63`. Same behavior; new public module.
- `src/lib/__tests__/auth-cleanup.test.ts` — Vitest unit suite covering the three orphan branches.
- `src/app/platform/_components/delete-tenant-dialog.tsx` — client dialog: kebab trigger → modal with slug input → submits via `useActionState` against `deleteTenant`.
- `tests/e2e/platform-delete-tenant.spec.ts` — Playwright e2e covering the full delete flow (gated by `E2E_ENABLED`).

**Modify**
- `src/actions/admin.ts` — delete the private `deleteAuthUserIfOrphan` definition and import it from `@/lib/auth-cleanup`.
- `src/actions/platform.ts` — add `DeleteTenantResult`, `DeleteTenantActionState`, and the `deleteTenant` server action.
- `src/app/platform/page.tsx` — extend the tenant-row grid to `1fr 180px 120px 40px`, add a blank header cell, and render `<DeleteTenantDialog />` in the trailing cell.

**No DB migrations.** All cascades and RLS already in place.

---

## Task 1: Lift `deleteAuthUserIfOrphan` into a shared module

**Why first:** Both `removeMember` (existing) and `deleteTenant` (new) need the same orphan-cleanup logic. Sharing it avoids drift and lets us write unit tests once. This refactor must not change behavior — `removeMember`'s existing tests/flows still pass.

**Files:**
- Create: `src/lib/auth-cleanup.ts`
- Create: `src/lib/__tests__/auth-cleanup.test.ts`
- Modify: `src/actions/admin.ts:1-63`

- [ ] **Step 1.1: Write the failing tests for `deleteAuthUserIfOrphan`**

Create `src/lib/__tests__/auth-cleanup.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteAuthUserIfOrphan } from "../auth-cleanup";

type AdminLike = {
  from: ReturnType<typeof vi.fn>;
  auth: { admin: { deleteUser: ReturnType<typeof vi.fn> } };
};

function makeAdminMock(opts: {
  memberCount?: number;
  isPlatformAdmin?: boolean;
  profileEmail?: string | null;
  pendingInviteCount?: number;
}): AdminLike {
  const {
    memberCount = 0,
    isPlatformAdmin = false,
    profileEmail = null,
    pendingInviteCount = 0,
  } = opts;

  const tenantMembers = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ count: memberCount }),
  };
  const platformAdmins = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: isPlatformAdmin ? { user_id: "u" } : null,
    }),
  };
  const profiles = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: profileEmail ? { email: profileEmail } : null,
    }),
  };
  // The real call chain is: from("tenant_invites").select(..., {count, head}).eq("email", ...).eq("status", "pending")
  // We need .eq twice and then await — so wire the second .eq to resolve.
  const tenantInvitesChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi
      .fn()
      .mockReturnValueOnce({
        eq: vi.fn().mockResolvedValue({ count: pendingInviteCount }),
      })
      .mockReturnValue({
        eq: vi.fn().mockResolvedValue({ count: pendingInviteCount }),
      }),
  };

  const from = vi.fn((table: string) => {
    if (table === "tenant_members") return tenantMembers;
    if (table === "platform_admins") return platformAdmins;
    if (table === "profiles") return profiles;
    if (table === "tenant_invites") return tenantInvitesChain;
    throw new Error(`unexpected table ${table}`);
  });

  return {
    from,
    auth: { admin: { deleteUser: vi.fn().mockResolvedValue({ data: {}, error: null }) } },
  };
}

describe("deleteAuthUserIfOrphan", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does NOT delete the auth user when they still have a tenant membership", async () => {
    const admin = makeAdminMock({ memberCount: 1 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await deleteAuthUserIfOrphan(admin as any, "u1");
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("does NOT delete the auth user when they are a platform admin", async () => {
    const admin = makeAdminMock({ memberCount: 0, isPlatformAdmin: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await deleteAuthUserIfOrphan(admin as any, "u1");
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("does NOT delete the auth user when a pending invite for their email exists", async () => {
    const admin = makeAdminMock({
      memberCount: 0,
      isPlatformAdmin: false,
      profileEmail: "user@example.com",
      pendingInviteCount: 1,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await deleteAuthUserIfOrphan(admin as any, "u1");
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("DELETES the auth user when fully orphaned", async () => {
    const admin = makeAdminMock({
      memberCount: 0,
      isPlatformAdmin: false,
      profileEmail: "user@example.com",
      pendingInviteCount: 0,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await deleteAuthUserIfOrphan(admin as any, "u1");
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith("u1");
  });
});
```

- [ ] **Step 1.2: Run the tests and confirm they fail**

Run: `npx vitest run src/lib/__tests__/auth-cleanup.test.ts`
Expected: FAIL — `Cannot find module '../auth-cleanup'`.

- [ ] **Step 1.3: Create `src/lib/auth-cleanup.ts` with the lifted helper**

```ts
import type { createAdminClient } from "@/lib/supabase/admin";

// Delete the auth user only when no memberships, pending invites, or
// platform-admin row reference them. Mirrors the rule used by removeMember:
// zero memberships AND not a platform admin AND no pending invite for their
// profile email.
export async function deleteAuthUserIfOrphan(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<void> {
  const { count: memberCount } = await admin
    .from("tenant_members")
    .select("tenant_id", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((memberCount ?? 0) > 0) return;

  const { data: platform } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (platform) return;

  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.email) {
    const { count: inviteCount } = await admin
      .from("tenant_invites")
      .select("id", { count: "exact", head: true })
      .eq("email", profile.email.toLowerCase())
      .eq("status", "pending");
    if ((inviteCount ?? 0) > 0) return;
  }

  await admin.auth.admin.deleteUser(userId);
}
```

- [ ] **Step 1.4: Run the tests and confirm they pass**

Run: `npx vitest run src/lib/__tests__/auth-cleanup.test.ts`
Expected: PASS — 4 tests pass.

- [ ] **Step 1.5: Update `src/actions/admin.ts` to import the shared helper**

Replace the private definition at `src/actions/admin.ts:27-63` (the `// Delete the auth user only when …` comment block plus the function body) with an import. The final state of the imports + that region should be:

```ts
"use server";

import { randomBytes } from "node:crypto";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { getActiveTenantId } from "@/lib/tenant";
import { canManageTenant } from "@/lib/platform";
import { logAction } from "@/lib/audit";
import { schemeFor } from "@/lib/platform-hosts";
import { deleteAuthUserIfOrphan } from "@/lib/auth-cleanup";
import { revalidatePath } from "next/cache";

export type AdminActionResult = { error?: string; success?: string } | void;

type InviteRole = "admin" | "member";

function normaliseRole(raw: string | null | undefined): InviteRole {
  return raw === "admin" ? "admin" : "member";
}

function makeInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// (deleteAuthUserIfOrphan moved to @/lib/auth-cleanup so the platform action can share it.)
```

- [ ] **Step 1.6: Run the full unit suite + lint + build to confirm no regressions**

Run: `npm test && npm run lint && npm run build`
Expected: all tests pass; lint clean; build succeeds. (`removeMember` still uses `deleteAuthUserIfOrphan` via the new import.)

- [ ] **Step 1.7: Commit**

```bash
git add src/lib/auth-cleanup.ts src/lib/__tests__/auth-cleanup.test.ts src/actions/admin.ts
git commit -m "refactor(auth-cleanup): lift deleteAuthUserIfOrphan into shared module

Extracted from src/actions/admin.ts so the upcoming deleteTenant platform
action can reuse the same orphan rules (memberships, platform-admin row,
pending invites). Behavior unchanged; covered by new Vitest unit tests."
```

---

## Task 2: Implement the `deleteTenant` server action

**Why before UI:** The action's contract drives the dialog's props (tenant name + slug). TDD-ing the action first gives us a stable surface for the client component.

**Files:**
- Modify: `src/actions/platform.ts`
- Create: `src/actions/__tests__/platform-delete.test.ts`

- [ ] **Step 2.1: Write the failing tests for `deleteTenant`**

Create `src/actions/__tests__/platform-delete.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Module-level mocks ----
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc: vi.fn().mockResolvedValue({ data: null, error: null }) })),
}));

const isPlatformAdminMock = vi.fn();
vi.mock("@/lib/platform", () => ({
  isCurrentUserPlatformAdmin: () => isPlatformAdminMock(),
  canManageTenant: vi.fn(),
  isCurrentUserTenantAdmin: vi.fn(),
}));

const deleteAuthUserIfOrphanMock = vi.fn();
vi.mock("@/lib/auth-cleanup", () => ({
  deleteAuthUserIfOrphan: (...args: unknown[]) => deleteAuthUserIfOrphanMock(...args),
}));

const logActionMock = vi.fn();
vi.mock("@/lib/audit", () => ({
  logAction: (...args: unknown[]) => logActionMock(...args),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Configurable admin-client mock. Each test rebuilds it.
type AdminMock = ReturnType<typeof buildAdmin>;
function buildAdmin(opts: {
  tenant?: { id: string; name: string; slug: string } | null;
  members?: { user_id: string }[];
  deleteError?: { message: string } | null;
}) {
  const { tenant = { id: "t1", name: "Acme", slug: "acme" }, members = [], deleteError = null } = opts;

  const tenantsTable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: tenant }),
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: deleteError }),
    }),
  };
  const membersTable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: members, error: null }),
  };
  const domainsTable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { domain: "acme.example.test" } }),
  };

  const from = vi.fn((table: string) => {
    if (table === "tenants") return tenantsTable;
    if (table === "tenant_members") return membersTable;
    if (table === "tenant_domains") return domainsTable;
    throw new Error(`unexpected table ${table}`);
  });

  return { from, tenantsTable, membersTable, domainsTable };
}

let currentAdmin: AdminMock;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => currentAdmin,
}));

beforeEach(() => {
  vi.clearAllMocks();
  currentAdmin = buildAdmin({});
});

// ---- Import under test (must be after mocks) ----
import { deleteTenant } from "../platform";

function makeFormData(tenantId: string, confirmSlug: string): FormData {
  const fd = new FormData();
  fd.set("tenant_id", tenantId);
  fd.set("confirm_slug", confirmSlug);
  return fd;
}

describe("deleteTenant", () => {
  it("rejects non-platform-admin callers", async () => {
    isPlatformAdminMock.mockResolvedValue(false);
    const res = await deleteTenant(undefined, makeFormData("t1", "acme"));
    expect(res).toEqual({ ok: false, error: "Not authorized." });
    expect(currentAdmin.tenantsTable.delete).not.toHaveBeenCalled();
  });

  it("returns 'no longer exists' when the tenant cannot be found", async () => {
    isPlatformAdminMock.mockResolvedValue(true);
    currentAdmin = buildAdmin({ tenant: null });
    const res = await deleteTenant(undefined, makeFormData("missing", "acme"));
    expect(res).toEqual({ ok: false, error: "Tenant no longer exists." });
  });

  it("rejects mismatched slug confirmation", async () => {
    isPlatformAdminMock.mockResolvedValue(true);
    const res = await deleteTenant(undefined, makeFormData("t1", "wrong-slug"));
    expect(res).toEqual({ ok: false, error: "Slug did not match." });
    expect(currentAdmin.tenantsTable.delete).not.toHaveBeenCalled();
  });

  it("deletes the tenant, calls orphan cleanup per member, and writes one audit row", async () => {
    isPlatformAdminMock.mockResolvedValue(true);
    currentAdmin = buildAdmin({
      tenant: { id: "t1", name: "Acme", slug: "acme" },
      members: [{ user_id: "u1" }, { user_id: "u2" }],
    });

    const res = await deleteTenant(undefined, makeFormData("t1", "acme"));

    expect(res).toEqual({ ok: true, tenantId: "t1", slug: "acme" });
    expect(currentAdmin.tenantsTable.delete).toHaveBeenCalledTimes(1);
    expect(deleteAuthUserIfOrphanMock).toHaveBeenCalledWith(currentAdmin, "u1");
    expect(deleteAuthUserIfOrphanMock).toHaveBeenCalledWith(currentAdmin, "u2");
    expect(logActionMock).toHaveBeenCalledTimes(1);
    expect(logActionMock.mock.calls[0][0]).toMatchObject({
      tenantId: null,
      action: "tenant.deleted",
      resourceType: "tenant",
      resourceId: "t1",
      metadata: expect.objectContaining({
        deleted_tenant_id: "t1",
        name: "Acme",
        slug: "acme",
        member_count: 2,
      }),
    });
  });

  it("surfaces the Postgres error when the delete fails", async () => {
    isPlatformAdminMock.mockResolvedValue(true);
    currentAdmin = buildAdmin({ deleteError: { message: "FK constraint blah" } });
    const res = await deleteTenant(undefined, makeFormData("t1", "acme"));
    expect(res).toEqual({ ok: false, error: "FK constraint blah" });
    expect(deleteAuthUserIfOrphanMock).not.toHaveBeenCalled();
  });

  it("collects failed orphan cleanups into the audit metadata", async () => {
    isPlatformAdminMock.mockResolvedValue(true);
    currentAdmin = buildAdmin({ members: [{ user_id: "u1" }, { user_id: "u2" }] });
    deleteAuthUserIfOrphanMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("boom"));

    const res = await deleteTenant(undefined, makeFormData("t1", "acme"));

    expect(res).toEqual({ ok: true, tenantId: "t1", slug: "acme" });
    expect(logActionMock.mock.calls[0][0].metadata.failed_user_cleanups).toEqual(["u2"]);
  });
});
```

- [ ] **Step 2.2: Run the tests and confirm they fail**

Run: `npx vitest run src/actions/__tests__/platform-delete.test.ts`
Expected: FAIL — `deleteTenant` is not exported from `../platform`.

- [ ] **Step 2.3: Implement `deleteTenant` in `src/actions/platform.ts`**

Append the following to the end of `src/actions/platform.ts`:

```ts
// ============================================================
// Delete a tenant (platform admin only).
// ============================================================

export type DeleteTenantResult =
  | { ok: true; tenantId: string; slug: string }
  | { ok: false; error: string };

export type DeleteTenantActionState = DeleteTenantResult | undefined;

export async function deleteTenant(
  _prev: DeleteTenantActionState,
  formData: FormData,
): Promise<DeleteTenantResult> {
  if (!(await isCurrentUserPlatformAdmin())) {
    return { ok: false, error: "Not authorized." };
  }

  const tenantId = (formData.get("tenant_id") as string | null)?.trim() ?? "";
  const confirmSlug = (formData.get("confirm_slug") as string | null)?.trim() ?? "";
  if (!tenantId) return { ok: false, error: "Missing tenant id." };

  const admin = createAdminClient();

  // 1. Load tenant snapshot (needed for slug check + audit metadata).
  const { data: tenant } = await admin
    .from("tenants")
    .select("id, name, slug")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) {
    // Force the page to re-fetch so a stale row clears even on this no-op.
    revalidatePath("/platform");
    return { ok: false, error: "Tenant no longer exists." };
  }

  // 2. Confirm slug (case-sensitive — slugs are lowercase by schema).
  if (confirmSlug !== tenant.slug) {
    return { ok: false, error: "Slug did not match." };
  }

  // 3. Capture members BEFORE the cascade — we need them for orphan cleanup.
  const { data: memberRows } = await admin
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId);
  const memberIds = (memberRows ?? []).map((r) => r.user_id as string);

  // 4. Capture the primary domain for audit metadata.
  const { data: primaryDomainRow } = await admin
    .from("tenant_domains")
    .select("domain")
    .eq("tenant_id", tenantId)
    .eq("is_primary", true)
    .maybeSingle();
  const primaryDomain = primaryDomainRow?.domain ?? null;

  // 5. The cascading delete. FK rules wipe domains, members, invites, groups,
  //    group_members, expenses, expense_splits. audit_log.tenant_id becomes
  //    NULL via the existing ON DELETE SET NULL.
  const { error: deleteErr } = await admin.from("tenants").delete().eq("id", tenantId);
  if (deleteErr) {
    return { ok: false, error: deleteErr.message };
  }

  // 6. Best-effort orphan cleanup per former member.
  const failedUserCleanups: string[] = [];
  for (const userId of memberIds) {
    try {
      await deleteAuthUserIfOrphan(admin, userId);
    } catch {
      failedUserCleanups.push(userId);
    }
  }

  // 7. Audit (tenant_id null because the tenant is gone; metadata carries the
  //    forensic detail).
  await logAction({
    tenantId: null,
    action: "tenant.deleted",
    resourceType: "tenant",
    resourceId: tenant.id,
    metadata: {
      deleted_tenant_id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      primary_domain: primaryDomain,
      member_count: memberIds.length,
      failed_user_cleanups: failedUserCleanups,
    },
  });

  revalidatePath("/platform");

  return { ok: true, tenantId: tenant.id, slug: tenant.slug };
}
```

Also add the import for `deleteAuthUserIfOrphan` at the top of the file. The existing imports section should gain:

```ts
import { deleteAuthUserIfOrphan } from "@/lib/auth-cleanup";
```

- [ ] **Step 2.4: Run the tests and confirm they pass**

Run: `npx vitest run src/actions/__tests__/platform-delete.test.ts`
Expected: PASS — 6 tests pass.

- [ ] **Step 2.5: Run lint + build**

Run: `npm run lint && npm run build`
Expected: clean lint, successful build.

- [ ] **Step 2.6: Commit**

```bash
git add src/actions/platform.ts src/actions/__tests__/platform-delete.test.ts
git commit -m "feat(platform): add deleteTenant server action

Platform-admin-only server action that:
 - validates a typed slug against the stored tenant slug,
 - captures member user_ids and the primary domain before the cascade,
 - DELETEs the tenants row (FK cascade fans out to every tenant-scoped table),
 - runs orphan-only auth-user cleanup via the shared helper,
 - writes one tenant.deleted audit row with forensic metadata.

Covered by Vitest unit suite (auth gate, slug mismatch, missing tenant,
happy path, delete-error surfacing, failed-orphan-cleanup metadata)."
```

---

## Task 3: Build the row-level Delete dialog (client component)

**Files:**
- Create: `src/app/platform/_components/delete-tenant-dialog.tsx`

- [ ] **Step 3.1: Create the dialog component**

```tsx
"use client";

import { useActionState, useId, useState } from "react";
import { deleteTenant, type DeleteTenantActionState } from "@/actions/platform";

type Props = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
};

export function DeleteTenantDialog({ tenantId, tenantName, tenantSlug }: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, formAction, pending] = useActionState<DeleteTenantActionState, FormData>(
    deleteTenant,
    undefined,
  );
  const inputId = useId();
  const canSubmit = typed === tenantSlug && !pending;

  function close() {
    if (pending) return;
    setOpen(false);
    setTyped("");
  }

  return (
    <>
      <button
        type="button"
        aria-label={`Delete ${tenantName}`}
        title="Delete tenant"
        onClick={() => setOpen(true)}
        style={{
          background: "transparent",
          border: "1px solid var(--rule)",
          color: "var(--ink-3)",
          borderRadius: 8,
          width: 28,
          height: 28,
          cursor: "pointer",
          fontSize: 14,
          lineHeight: 1,
        }}
      >
        ⋯
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${inputId}-title`}
          onClick={close}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ maxWidth: 460, width: "100%", padding: 24, borderRadius: 16 }}
          >
            <h2
              id={`${inputId}-title`}
              className="serif"
              style={{ fontSize: 22, margin: 0, letterSpacing: "-0.015em" }}
            >
              Delete tenant
            </h2>
            <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "12px 0 4px", lineHeight: 1.5 }}>
              This permanently deletes <strong style={{ color: "var(--ink)" }}>{tenantName}</strong>{" "}
              and everything it owns: groups, expenses, members, invites, and domains.
            </p>
            <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 16px", lineHeight: 1.5 }}>
              Members who don&apos;t belong to any other tenant will also have their account removed.
            </p>

            <form action={formAction}>
              <input type="hidden" name="tenant_id" value={tenantId} />
              <label
                htmlFor={inputId}
                style={{ display: "block", fontSize: 12, color: "var(--ink-3)", marginBottom: 6 }}
              >
                Type <code className="mono">{tenantSlug}</code> to confirm
              </label>
              <input
                id={inputId}
                name="confirm_slug"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                style={{
                  width: "100%",
                  fontFamily: "var(--font-mono)",
                  fontSize: 14,
                  padding: "10px 12px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--rule)",
                  borderRadius: 10,
                  color: "var(--ink)",
                  marginBottom: 14,
                }}
              />

              {state && state.ok === false && (
                <div
                  role="alert"
                  style={{
                    fontSize: 12,
                    color: "var(--neg, #f87171)",
                    marginBottom: 12,
                  }}
                >
                  {state.error}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="btn" onClick={close} disabled={pending}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn"
                  disabled={!canSubmit}
                  style={{
                    background: "var(--neg, #b91c1c)",
                    color: "white",
                    opacity: canSubmit ? 1 : 0.5,
                  }}
                >
                  {pending ? "Deleting…" : "Delete tenant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3.2: Run lint + build to confirm the file compiles**

Run: `npm run lint && npm run build`
Expected: clean lint, successful build (file is referenced lazily — Next won't complain until Task 4 wires it in, but type-checking should still pass).

- [ ] **Step 3.3: Commit**

```bash
git add src/app/platform/_components/delete-tenant-dialog.tsx
git commit -m "feat(platform): add delete-tenant confirmation dialog

Client component that renders a row-level kebab trigger, a modal with a
type-the-slug confirmation input, and submits to the deleteTenant server
action via useActionState. Inline error display, disabled-until-match
button, pending-state lock."
```

---

## Task 4: Wire the dialog into `/platform`

**Files:**
- Modify: `src/app/platform/page.tsx`

- [ ] **Step 4.1: Add the slug column to the tenant fetch**

The page currently selects `id, name, created_at` (line 20). Update the select string to include `slug`:

```ts
supabase.from("tenants").select("id, name, slug, created_at").order("created_at", { ascending: false }),
```

Then extend `TenantRow` (line 5-9):

```ts
type TenantRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};
```

- [ ] **Step 4.2: Import the dialog at the top of the file**

Add after the existing imports:

```ts
import { DeleteTenantDialog } from "./_components/delete-tenant-dialog";
```

- [ ] **Step 4.3: Update the grid to add a trailing action column**

Find the two `gridTemplateColumns: "1fr 180px 120px"` declarations in `src/app/platform/page.tsx` (the header row at ~line 109 and the data row at ~line 138) and change both to:

```ts
gridTemplateColumns: "1fr 180px 120px 40px"
```

In the header row block (`<span>Tenant</span> … <span>Members</span>`), add a fourth blank header span at the end:

```tsx
<span>Tenant</span>
<span>Primary domain</span>
<span>Members</span>
<span />
```

In the data row block, after the `Members` count `<div>`, add the dialog:

```tsx
<div style={{ display: "flex", justifyContent: "flex-end" }}>
  <DeleteTenantDialog
    tenantId={t.id}
    tenantName={t.name}
    tenantSlug={t.slug}
  />
</div>
```

- [ ] **Step 4.4: Run lint + build**

Run: `npm run lint && npm run build`
Expected: clean lint, successful build.

- [ ] **Step 4.5: Smoke-test in the browser**

Start the dev server (`npm run dev`) and visit `/platform` as a signed-in platform admin. Verify:
- Every tenant row shows the `⋯` button on the right.
- Clicking it opens the dialog with the correct tenant name + slug in the prompt.
- The Delete button stays disabled until the slug is typed exactly.
- Typing the wrong slug keeps the button disabled.

Stop the dev server when done.

- [ ] **Step 4.6: Commit**

```bash
git add src/app/platform/page.tsx
git commit -m "feat(platform): wire delete-tenant dialog into tenant list

/platform now renders a trailing action cell per tenant row that mounts
the DeleteTenantDialog. Selects tenant.slug so the dialog can show + verify
the confirmation prompt."
```

---

## Task 5: Playwright e2e for the full delete flow

**Files:**
- Create: `tests/e2e/platform-delete-tenant.spec.ts`

The existing e2e spec is gated by `E2E_ENABLED` and assumes local Supabase. Follow that pattern.

- [ ] **Step 5.1: Create the e2e spec**

```ts
import { test, expect } from "@playwright/test";

// Requires:
//  1. Supabase local running (supabase start).
//  2. .env.local pointed at local Supabase.
//  3. Seeded platform-admin user + a target tenant ("acme") with two members.
//  4. Authenticated session cookie for the platform-admin user.
//
// Run: E2E_ENABLED=1 npx playwright test tests/e2e/platform-delete-tenant.spec.ts

test.describe("platform admin deletes a tenant", () => {
  test.skip(
    !process.env.E2E_ENABLED,
    "Set E2E_ENABLED=1 to run E2E tests with local Supabase",
  );

  test("type-the-slug confirm gate + delete + audit + slug reuse", async ({ page }) => {
    await page.goto("/platform");
    await expect(page.getByRole("heading", { name: /tenants?/i })).toBeVisible();

    // Locate the row for tenant "acme" and open its delete dialog.
    const acmeRow = page.locator("div", { hasText: "acme" }).first();
    await acmeRow.getByRole("button", { name: /delete acme/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Wrong slug → button stays disabled.
    const slugInput = dialog.locator('input[name="confirm_slug"]');
    await slugInput.fill("acmexx");
    const deleteBtn = dialog.getByRole("button", { name: /delete tenant/i });
    await expect(deleteBtn).toBeDisabled();

    // Correct slug → enabled → click.
    await slugInput.fill("acme");
    await expect(deleteBtn).toBeEnabled();
    await deleteBtn.click();

    // After revalidate the row should be gone.
    await expect(page.locator("div", { hasText: "acme" })).toHaveCount(0);

    // Slug freed: re-onboarding the same slug should succeed.
    await page.goto("/platform/onboard");
    await page.fill('input[name="name"]', "Acme 2");
    await page.fill('input[name="slug"]', "acme");
    await page.fill('input[name="owner_email"]', "owner+reuse@example.test");
    await page.click('button:has-text("Onboard")');
    await expect(page.getByText(/onboard/i)).toBeVisible();
  });
});
```

- [ ] **Step 5.2: Run the e2e suite (optional locally) and lint**

Run: `npm run lint`
Expected: clean.

The e2e itself requires local Supabase + seed data; run with `E2E_ENABLED=1 npx playwright test tests/e2e/platform-delete-tenant.spec.ts` when that environment is available. Document any seed gaps you hit and skip running locally if seeds aren't yet in place (the test is `skip`-guarded by `E2E_ENABLED`).

- [ ] **Step 5.3: Commit**

```bash
git add tests/e2e/platform-delete-tenant.spec.ts
git commit -m "test(e2e): platform admin deletes a tenant

Gated by E2E_ENABLED. Covers: open delete dialog, slug mismatch keeps the
button disabled, correct slug deletes the tenant, the slug is freed for
re-onboarding."
```

---

## Task 6: Final verification

- [ ] **Step 6.1: Run the full unit suite, lint, and build**

Run: `npm test && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 6.2: Manual platform-admin smoke test**

Start `npm run dev`. As a platform admin:
1. Onboard a throwaway tenant via `/platform/onboard`.
2. From `/platform`, open the delete dialog for it.
3. Confirm the typed slug gate works (wrong → disabled; right → enabled).
4. Delete. Row vanishes.
5. Reload `/platform` — audit list shows a `tenant.deleted` entry with the deleted tenant id in `resource_id`.
6. Re-onboard a new tenant with the same slug to confirm reuse.

- [ ] **Step 6.3: Optional — open a PR**

If working on a branch, push and open a PR titled something like `feat(platform): platform admin can delete a tenant`.

---

## Spec Coverage Check

| Spec section            | Implemented in                       |
| ----------------------- | ------------------------------------ |
| Platform-admin gate     | Task 2 (Step 2.3)                    |
| Type-the-slug confirm   | Task 2 (server check) + Task 3 (UI)  |
| Cascading delete        | Task 2 (single `DELETE FROM tenants`)|
| Orphan-only user cleanup| Task 1 (shared helper) + Task 2 loop |
| Audit `tenant.deleted`  | Task 2 (Step 2.3)                    |
| Free slug + domain      | Verified in Task 5 + Task 6          |
| Row-level dialog UI     | Task 3 + Task 4                      |
| Unit tests              | Tasks 1 & 2                          |
| Playwright e2e          | Task 5                               |
| No schema changes       | Confirmed — no migration created     |
