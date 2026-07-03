"use client";

import { useState, useTransition } from "react";
import { createTagAction, updateTagAction, deleteTagAction } from "@/actions/tags";
import type { Tag } from "@/lib/types";

const COLORS = [
  { label: "Gold",       value: "#d4a853" },
  { label: "Sage",       value: "#7fb069" },
  { label: "Terracotta", value: "#c27564" },
  { label: "Sky",        value: "#6aaccc" },
  { label: "Lavender",   value: "#9b8ec4" },
  { label: "Rose",       value: "#cc8899" },
  { label: "Slate",      value: "#6e8ca0" },
  { label: "Sand",       value: "#a0916e" },
];

type Props = { tenantId: string; initialTags: Tag[] };

export function TagsSection({ tenantId, initialTags }: Props) {
  const [tags, setTags] = useState<Tag[]>(initialTags);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(COLORS[0].value);
  const [editError, setEditError] = useState<string | null>(null);
  const [isEditPending, startEditTransition] = useTransition();

  // Create state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLORS[0].value);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreatePending, startCreateTransition] = useTransition();

  // Delete state
  const [isDeletePending, startDeleteTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function startEdit(t: Tag) {
    setEditingId(t.id);
    setEditName(t.name);
    setEditColor(t.color);
    setEditError(null);
  }

  function saveEdit() {
    if (!editingId) return;
    startEditTransition(async () => {
      const res = await updateTagAction(editingId, editName, editColor);
      if ("error" in res) { setEditError(res.error); return; }
      setTags((prev) => prev.map((t) => (t.id === res.tag.id ? res.tag : t)));
      setEditingId(null);
    });
  }

  function handleDelete(tagId: string) {
    setDeleteError(null);
    startDeleteTransition(async () => {
      const res = await deleteTagAction(tagId);
      if (res.error) { setDeleteError(res.error); return; }
      setTags((prev) => prev.filter((t) => t.id !== tagId));
    });
  }

  function handleCreate() {
    if (!newName.trim()) return;
    startCreateTransition(async () => {
      const res = await createTagAction(tenantId, newName.trim(), newColor);
      if ("error" in res) { setCreateError(res.error); return; }
      setTags((prev) => {
        if (prev.find((t) => t.id === res.tag.id)) return prev;
        return [...prev, res.tag].sort((a, b) => a.name.localeCompare(b.name));
      });
      setNewName("");
      setNewColor(COLORS[0].value);
      setShowCreate(false);
      setCreateError(null);
    });
  }

  return (
    <section className="card-surface p-5">
      <p className="eyebrow mb-3">Tags</p>

      {deleteError && (
        <p className="mb-3 text-xs text-terra">{deleteError}</p>
      )}

      {tags.length === 0 && !showCreate && (
        <p className="text-sm text-ink-muted mb-3">No tags yet.</p>
      )}

      <div className="space-y-1 mb-4">
        {tags.map((t) =>
          editingId === t.id ? (
            /* Inline edit form */
            <div key={t.id} className="rounded-xl border border-rule p-3 space-y-3">
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={32}
                className="input-warm w-full text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); saveEdit(); }
                  if (e.key === "Escape") { setEditingId(null); }
                }}
              />
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    onClick={() => setEditColor(c.value)}
                    style={{
                      width: 20, height: 20, borderRadius: "50%",
                      background: c.value, cursor: "pointer", border: "none",
                      outline: editColor === c.value ? `2px solid var(--ink)` : "none",
                      outlineOffset: 2,
                    }}
                  />
                ))}
              </div>
              {editError && <p className="text-xs text-terra">{editError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={isEditPending || !editName.trim()}
                  className="btn btn-accent flex-1 justify-center"
                  style={{ fontSize: 12, padding: "5px 12px" }}
                >
                  {isEditPending ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingId(null); setEditError(null); }}
                  className="btn btn-ghost"
                  style={{ fontSize: 12, padding: "5px 12px" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* Tag row */
            <div
              key={t.id}
              className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-warm"
            >
              <span
                style={{ width: 10, height: 10, borderRadius: "50%", background: t.color, flexShrink: 0 }}
              />
              <span className="flex-1 text-sm text-ink">{t.name}</span>
              <button
                type="button"
                onClick={() => startEdit(t)}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ink-3)", fontSize: 12 }}
                title="Edit tag"
              >
                ✏
              </button>
              <button
                type="button"
                onClick={() => handleDelete(t.id)}
                disabled={isDeletePending}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ink-3)", fontSize: 13 }}
                title="Delete tag"
              >
                ×
              </button>
            </div>
          )
        )}
      </div>

      {/* Create form */}
      {showCreate ? (
        <div className="rounded-xl border border-rule p-3 space-y-3">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={32}
            placeholder="Tag name…"
            className="input-warm w-full text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); handleCreate(); }
              if (e.key === "Escape") { setShowCreate(false); setNewName(""); setCreateError(null); }
            }}
          />
          <div className="flex gap-2 flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.label}
                onClick={() => setNewColor(c.value)}
                style={{
                  width: 20, height: 20, borderRadius: "50%",
                  background: c.value, cursor: "pointer", border: "none",
                  outline: newColor === c.value ? `2px solid var(--ink)` : "none",
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
          {createError && <p className="text-xs text-terra">{createError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={isCreatePending || !newName.trim()}
              className="btn btn-accent flex-1 justify-center"
              style={{ fontSize: 12, padding: "5px 12px" }}
            >
              {isCreatePending ? "Creating…" : "Create tag"}
            </button>
            <button
              type="button"
              onClick={() => { setShowCreate(false); setNewName(""); setCreateError(null); }}
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: "5px 12px" }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="btn btn-ghost w-full justify-center"
          style={{ fontSize: 12 }}
        >
          + Add tag
        </button>
      )}
    </section>
  );
}
