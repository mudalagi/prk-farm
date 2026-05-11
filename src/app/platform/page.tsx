import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { I } from "@/components/ui/icons";
import { DeleteTenantDialog } from "./_components/delete-tenant-dialog";

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};
type DomainRow = {
  tenant_id: string;
  domain: string;
  is_primary: boolean;
  verified_at: string | null;
};
export default async function PlatformHomePage() {
  const supabase = await createClient();

  const [tenantsRes, domainsRes, membersRes, auditRes] = await Promise.all([
    supabase.from("tenants").select("id, name, slug, created_at").order("created_at", { ascending: false }),
    supabase
      .from("tenant_domains")
      .select("tenant_id, domain, is_primary, verified_at")
      .order("is_primary", { ascending: false }),
    supabase.from("tenant_members").select("tenant_id"),
    supabase
      .from("audit_log")
      .select("id, tenant_id, action, resource_type, resource_id, created_at, metadata")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const tenants = (tenantsRes.data ?? []) as TenantRow[];
  const domains = (domainsRes.data ?? []) as DomainRow[];
  const memberships = (membersRes.data ?? []) as { tenant_id: string }[];
  type AuditRow = {
    id: string;
    tenant_id: string | null;
    action: string;
    resource_type: string | null;
    resource_id: string | null;
    created_at: string;
    metadata: Record<string, unknown> | null;
  };
  const audit = (auditRes.data ?? []) as AuditRow[];

  const memberCount = new Map<string, number>();
  for (const m of memberships) {
    memberCount.set(m.tenant_id, (memberCount.get(m.tenant_id) ?? 0) + 1);
  }
  const domainsByTenant = new Map<string, DomainRow[]>();
  for (const d of domains) {
    const list = domainsByTenant.get(d.tenant_id) ?? [];
    list.push(d);
    domainsByTenant.set(d.tenant_id, list);
  }

  return (
    <div
      className="mx-auto"
      style={{ maxWidth: 1040, padding: "clamp(20px, 3vw, 32px) clamp(20px, 4vw, 40px) 56px" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 8,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Platform · all tenants
          </div>
          <h1
            className="serif"
            style={{
              fontSize: "clamp(28px, 4.5vw, 40px)",
              margin: 0,
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
            }}
          >
            {tenants.length} {tenants.length === 1 ? "tenant" : "tenants"}
          </h1>
        </div>
        <Link href="/platform/onboard" className="btn btn-accent">
          <I.plus size={14} /> Onboard tenant
        </Link>
      </div>
      <p style={{ fontSize: 14, color: "var(--ink-3)", margin: "12px 0 28px", maxWidth: 560 }}>
        Onboard from this page or via the CLI (<code className="mono">npm run tenant:create</code>).
        Below: tenants, their custom domains, and recent audit entries.
      </p>

      {/* Tenants list */}
      <h2 className="serif" style={{ fontSize: 20, margin: "0 0 12px", letterSpacing: "-0.015em" }}>
        Tenants
      </h2>
      <div
        className="card"
        style={{ borderRadius: 14, overflow: "hidden", padding: 0, marginBottom: 32 }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 180px 120px 40px",
            padding: "10px 18px",
            background: "var(--surface-2)",
            borderBottom: "1px solid var(--rule)",
            fontSize: 10,
            color: "var(--ink-3)",
            fontFamily: "var(--font-mono)",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            columnGap: 16,
          }}
        >
          <span>Tenant</span>
          <span>Primary domain</span>
          <span>Members</span>
          <span />
        </div>
        {tenants.length === 0 ? (
          <div style={{ padding: 28, textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
            No tenants yet.
          </div>
        ) : (
          tenants.map((t, i) => {
            const d = (domainsByTenant.get(t.id) ?? []).find((x) => x.is_primary);
            const aliases = (domainsByTenant.get(t.id) ?? []).filter((x) => !x.is_primary);
            return (
              <div
                key={t.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 180px 120px 40px",
                  padding: "14px 18px",
                  borderBottom: i === tenants.length - 1 ? "none" : "1px solid var(--rule-2)",
                  alignItems: "center",
                  columnGap: 16,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: "var(--ink)" }}>{t.name}</div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 11,
                      color: "var(--ink-4)",
                      marginTop: 2,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {t.id}
                  </div>
                  {aliases.length > 0 && (
                    <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
                      aliases: {aliases.map((a) => a.domain).join(", ")}
                    </div>
                  )}
                </div>
                <div className="mono" style={{ fontSize: 12, color: d ? "var(--ink)" : "var(--ink-4)" }}>
                  {d?.domain ?? "—"}
                  {d && (
                    <div
                      style={{
                        fontSize: 10,
                        color: d.verified_at ? "var(--pos)" : "var(--ink-4)",
                        marginTop: 2,
                      }}
                    >
                      {d.verified_at ? "verified" : "pending verification"}
                    </div>
                  )}
                </div>
                <div
                  className="mono tnum"
                  style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}
                >
                  {memberCount.get(t.id) ?? 0}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <DeleteTenantDialog
                    tenantId={t.id}
                    tenantName={t.name}
                    tenantSlug={t.slug}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Recent audit */}
      <h2 className="serif" style={{ fontSize: 20, margin: "0 0 12px", letterSpacing: "-0.015em" }}>
        Recent activity
      </h2>
      <div
        className="card"
        style={{ borderRadius: 14, overflow: "hidden", padding: 0 }}
      >
        {audit.length === 0 ? (
          <div style={{ padding: 28, textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
            No audit entries yet.
          </div>
        ) : (
          audit.map((a, i) => (
            <div
              key={a.id}
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr 160px",
                padding: "12px 18px",
                borderBottom: i === audit.length - 1 ? "none" : "1px solid var(--rule-2)",
                columnGap: 16,
                alignItems: "center",
              }}
            >
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  color: "var(--ink-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {a.action}
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
                {a.resource_type ?? "—"} {a.resource_id ? `· ${a.resource_id}` : ""}
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", textAlign: "right" }}>
                {new Date(a.created_at).toLocaleString("en-IN")}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
