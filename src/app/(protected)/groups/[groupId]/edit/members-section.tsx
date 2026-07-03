"use client";

import { useState, useTransition, useRef, useEffect, useCallback } from "react";
import { setOwnership, updateMemberDisplayName } from "@/actions/group";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

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

export function MembersSection({ groupId, initialMembers }: Props) {
  const [members, setMembers] = useState<Member[]>(initialMembers);

  // Inline name editing
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState("");
  const [isNamePending, startNameTransition] = useTransition();
  const [nameError, setNameError] = useState<string | null>(null);

  // Member search
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Ownership save
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSavePending, startSaveTransition] = useTransition();

  const total = members.reduce((s, m) => s + m.ownershipPct, 0);
  const isValid = members.length > 0 && Math.abs(total - 100) < 0.01;

  // Close search dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setResults([]);
        setNoResults(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const searchProfiles = useCallback(
    async (email: string) => {
      if (email.length < 3) { setResults([]); setNoResults(false); return; }
      setSearching(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, email, avatar_url, created_at")
        .ilike("email", `%${email}%`)
        .limit(6);
      const filtered = (data ?? []).filter((p) => !members.some((m) => m.userId === p.id));
      setResults(filtered as Profile[]);
      setNoResults(filtered.length === 0 && email.length >= 3);
      setSearching(false);
    },
    [members]
  );

  function handleQueryChange(v: string) {
    setQuery(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => searchProfiles(v), 280);
  }

  function addMember(profile: Profile) {
    setMembers((prev) => [
      ...prev,
      { userId: profile.id, email: profile.email, displayName: profile.display_name, ownershipPct: 0 },
    ]);
    setQuery("");
    setResults([]);
    setNoResults(false);
  }

  function removeMember(userId: string) {
    setMembers((prev) => prev.filter((m) => m.userId !== userId));
  }

  function startEditName(m: Member) {
    setEditingNameId(m.userId);
    setEditNameValue(m.displayName);
    setNameError(null);
  }

  function saveEditName(userId: string) {
    startNameTransition(async () => {
      const res = await updateMemberDisplayName(userId, editNameValue);
      if (res.error) { setNameError(res.error); return; }
      setMembers((prev) =>
        prev.map((m) => m.userId === userId ? { ...m, displayName: editNameValue.trim() } : m)
      );
      setEditingNameId(null);
    });
  }

  function setOwnershipPct(userId: string, value: string) {
    const pct = parseFloat(value) || 0;
    setMembers((prev) => prev.map((m) => m.userId === userId ? { ...m, ownershipPct: pct } : m));
  }

  function distributeEqually() {
    if (members.length === 0) return;
    const base = Math.round((100 / members.length) * 100) / 100;
    const rem = Math.round((100 - base * members.length) * 100) / 100;
    setMembers((prev) => prev.map((m, i) => ({ ...m, ownershipPct: i === 0 ? base + rem : base })));
  }

  function handleSave() {
    setSaveError(null);
    startSaveTransition(async () => {
      const fd = new FormData();
      fd.append("groupId", groupId);
      fd.append("allocations", JSON.stringify(members.map((m) => ({ userId: m.userId, pct: m.ownershipPct }))));
      const res = await setOwnership(undefined, fd);
      if (res?.error) setSaveError(res.error);
      // setOwnership redirects on success
    });
  }

  return (
    <section className="card-surface p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="eyebrow">Members & Ownership</p>
        {members.length > 1 && (
          <button
            type="button"
            onClick={distributeEqually}
            className="text-xs text-ink-muted hover:text-ink underline"
          >
            Split equally
          </button>
        )}
      </div>

      {/* Add member search */}
      <div className="relative mb-5" ref={searchRef}>
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Add member by email…"
          className="input-warm w-full"
          style={{ fontSize: 13 }}
        />
        {(results.length > 0 || searching || noResults) && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
            zIndex: 20, borderRadius: 12,
            border: "1px solid var(--rule-strong)",
            background: "var(--card)", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            overflow: "hidden",
          }}>
            {searching && <div style={{ padding: "10px 14px", fontSize: 13, color: "var(--ink-3)" }}>Searching…</div>}
            {noResults && !searching && <div style={{ padding: "10px 14px", fontSize: 13, color: "var(--ink-3)" }}>No user found</div>}
            {results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addMember(p)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  width: "100%", padding: "10px 14px",
                  border: "none", borderBottom: "1px solid var(--rule-2)",
                  background: "none", cursor: "pointer", textAlign: "left",
                  color: "var(--ink)",
                }}
                className="search-result-btn"
              >
                <span style={{ fontSize: 13, fontWeight: 500 }}>{p.display_name}</span>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{p.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Member list */}
      {members.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 16 }}>No members yet.</p>
      ) : (
        <div className="space-y-1 mb-4">
          {members.map((m) => (
            <div
              key={m.userId}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 12,
                border: "1px solid var(--rule-2)",
                background: "var(--surface-warm)",
              }}
            >
              {/* Name + email */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {editingNameId === m.userId ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      autoFocus
                      value={editNameValue}
                      onChange={(e) => setEditNameValue(e.target.value)}
                      maxLength={80}
                      style={{
                        flex: 1, background: "var(--surface-2)",
                        border: "1px solid var(--rule)", borderRadius: 6,
                        padding: "3px 8px", fontSize: 13, color: "var(--ink)", outline: "none",
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEditName(m.userId);
                        if (e.key === "Escape") { setEditingNameId(null); setNameError(null); }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => saveEditName(m.userId)}
                      disabled={isNamePending}
                      style={{
                        background: "var(--accent)", border: "none", borderRadius: 6,
                        padding: "3px 8px", fontSize: 11, fontWeight: 600,
                        color: "#000", cursor: isNamePending ? "wait" : "pointer",
                      }}
                    >
                      {isNamePending ? "…" : "✓"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingNameId(null); setNameError(null); }}
                      style={{
                        background: "none", border: "1px solid var(--rule)", borderRadius: 6,
                        padding: "3px 6px", fontSize: 12, color: "var(--ink-3)", cursor: "pointer",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{m.displayName}</span>
                    <button
                      type="button"
                      onClick={() => startEditName(m)}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", color: "var(--ink-4)", fontSize: 11, lineHeight: 1 }}
                      title="Edit name"
                    >
                      ✏
                    </button>
                  </div>
                )}
                {nameError && editingNameId === m.userId && (
                  <p style={{ fontSize: 11, color: "var(--neg)", marginTop: 2 }}>{nameError}</p>
                )}
                <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{m.email}</p>
              </div>

              {/* Ownership % */}
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={m.ownershipPct || ""}
                  onChange={(e) => setOwnershipPct(m.userId, e.target.value)}
                  style={{
                    width: 90, textAlign: "right",
                    background: "var(--surface-2)",
                    border: "1px solid var(--rule)", borderRadius: 8,
                    padding: "5px 8px", fontSize: 13, color: "var(--ink)", outline: "none",
                  }}
                />
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>%</span>
              </div>

              {/* Remove */}
              <button
                type="button"
                onClick={() => removeMember(m.userId)}
                title="Remove member"
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  padding: "4px", color: "var(--ink-4)", fontSize: 16, lineHeight: 1,
                  borderRadius: 6, flexShrink: 0,
                }}
                className="remove-btn"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Total */}
      {members.length > 0 && (
        <div style={{
          display: "flex", justifyContent: "flex-end",
          fontSize: 13, fontWeight: 500, marginBottom: 16,
          color: isValid ? "var(--pos)" : "var(--neg)",
        }}>
          Total: {total.toFixed(2)}% {!isValid && "(must be 100%)"}
        </div>
      )}

      <p style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 16, lineHeight: 1.5 }}>
        Ownership changes apply to new expenses only.
      </p>

      {saveError && <p className="text-sm text-terra mb-3">{saveError}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={isSavePending || !isValid}
        className="btn btn-primary btn-press w-full justify-center"
      >
        {isSavePending ? "Saving…" : "Save members & ownership"}
      </button>

      <style>{`
        .search-result-btn:hover { background: var(--surface-warm) !important; }
        .remove-btn:hover { color: var(--neg) !important; }
      `}</style>
    </section>
  );
}
