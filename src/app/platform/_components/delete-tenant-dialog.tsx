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
