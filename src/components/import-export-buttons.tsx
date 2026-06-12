"use client";

import { useRef, useState, useTransition } from "react";
import { importExpenses, type ImportPayload, type ImportResult } from "@/actions/import";
import { I } from "@/components/ui/icons";

type Props = { groupId: string };

export function ImportExportButtons({ groupId }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      let payload: ImportPayload;
      try {
        payload = JSON.parse(ev.target?.result as string) as ImportPayload;
      } catch {
        setResult({ error: "Could not parse file — make sure it is a valid JSON export." });
        return;
      }
      startTransition(async () => {
        const res = await importExpenses(groupId, payload);
        setResult(res);
        if (fileRef.current) fileRef.current.value = "";
      });
    };
    reader.readAsText(file);
  }

  const isSuccess = result && "imported" in result;

  return (
    <div style={{ display: "contents" }}>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => { setResult(null); fileRef.current?.click(); }}
        disabled={isPending}
      >
        <I.upload size={14} />
        {isPending ? "Importing…" : "Import"}
      </button>

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={handleFile}
      />

      {result && (
        <div
          style={{
            width: "100%",
            marginTop: 4,
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: 13,
            border: "1px solid",
            borderColor: isSuccess
              ? "color-mix(in oklch, var(--pos) 30%, transparent)"
              : "color-mix(in oklch, var(--neg) 30%, transparent)",
            background: isSuccess
              ? "color-mix(in oklch, var(--pos) 8%, transparent)"
              : "color-mix(in oklch, var(--neg) 8%, transparent)",
            color: isSuccess ? "var(--pos)" : "var(--neg)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {"error" in result && <span>{result.error}</span>}
          {isSuccess && "imported" in result && (
            <>
              <span>
                Imported {result.imported} expense{result.imported !== 1 ? "s" : ""}
                {"skipped" in result && result.skipped > 0
                  ? `, skipped ${result.skipped} duplicate${result.skipped !== 1 ? "s" : ""}`
                  : ""}.
              </span>
              {"errors" in result && result.errors.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "var(--ink-3)" }}>
                  {result.errors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => setResult(null)}
            style={{
              alignSelf: "flex-end",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 11,
              color: "var(--ink-3)",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: 0,
            }}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
