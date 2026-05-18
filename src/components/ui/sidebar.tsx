"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { I } from "./icons";
import { Avatar } from "./avatar";
import { ThemeToggle } from "./theme-toggle";
import { formatInr } from "@/lib/format";

type NavItem = {
  href: string;
  label: string;
  Icon: (p: { size?: number; stroke?: string }) => React.ReactElement;
  match?: (pathname: string) => boolean;
};

type Props = {
  tenantName: string;
  tenantMemberCount: number;
  userName: string;
  userId: string;
  userRoleLabel: string;
  totalYouOwe: number;
  totalOwedToYou: number;
  isTenantAdmin: boolean;
  hasMultipleTenants: boolean;
};

export function Sidebar({
  tenantName,
  tenantMemberCount,
  userName,
  userId,
  userRoleLabel,
  totalYouOwe,
  totalOwedToYou,
  isTenantAdmin,
  hasMultipleTenants,
}: Props) {
  const pathname = usePathname() ?? "/";

  const items: NavItem[] = [
    { href: "/", label: "Overview", Icon: I.home, match: (p) => p === "/" },
    { href: "/groups", label: "Groups", Icon: I.users, match: (p) => p.startsWith("/groups") },
    { href: "/balances", label: "Balances", Icon: I.scale, match: (p) => p.startsWith("/balances") },
    { href: "/timeline", label: "Timeline", Icon: I.chart, match: (p) => p.startsWith("/timeline") },
    { href: "/reports", label: "Reports", Icon: I.receipt, match: (p) => p.startsWith("/reports") },
    ...(isTenantAdmin ? [{ href: "/admin", label: "Admin", Icon: I.settings, match: (p: string) => p.startsWith("/admin") }] : []),
  ];

  return (
    <aside
      className="hidden md:flex md:flex-col"
      style={{
        width: 248,
        flexShrink: 0,
        minHeight: "100vh",
        borderRight: "1px solid var(--rule)",
        background: "var(--bg)",
        padding: "18px 14px",
        position: "sticky",
        top: 0,
        alignSelf: "flex-start",
        viewTransitionName: "site-nav",
      }}
    >
      {/* Tenant card — linked to /tenants only when there's a real choice. */}
      {(() => {
        const cardStyle: React.CSSProperties = {
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          borderRadius: 10,
          background: "var(--card)",
          border: "1px solid var(--rule)",
          textDecoration: "none",
          marginBottom: 20,
          color: "var(--ink)",
        };
        const inside = (
          <>
            <span
              aria-hidden
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: "var(--accent)",
                color: "var(--accent-ink)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <I.leaf size={14} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--ink)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {tenantName}
              </span>
              <span style={{ display: "block", fontSize: 10, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
                {tenantMemberCount} {tenantMemberCount === 1 ? "member" : "members"}
              </span>
            </span>
            {hasMultipleTenants && <I.chevron size={14} stroke="var(--ink-3)" />}
          </>
        );
        return hasMultipleTenants ? (
          <Link href="/tenants" style={cardStyle}>
            {inside}
          </Link>
        ) : (
          <div style={cardStyle}>{inside}</div>
        );
      })()}

      {/* Nav */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map((it) => {
          const active = it.match ? it.match(pathname) : pathname === it.href;
          return (
            <Link
              key={it.href}
              href={it.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 10px",
                borderRadius: 8,
                textDecoration: "none",
                background: active ? "var(--card)" : "transparent",
                color: active ? "var(--ink)" : "var(--ink-2)",
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                boxShadow: active ? "0 1px 2px rgba(0,0,0,0.04), 0 0 0 1px var(--rule)" : "none",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              <it.Icon size={16} stroke={active ? "var(--accent)" : "currentColor"} />
              <span style={{ flex: 1 }}>{it.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Primary action */}
      <Link href="/groups" className="btn btn-primary" style={{ marginTop: 16, justifyContent: "center" }}>
        <I.plus size={14} />
        New expense
      </Link>

      <div style={{ flex: 1 }} />

      {/* Summary card */}
      <div
        style={{
          padding: 14,
          borderRadius: 12,
          background: "var(--card)",
          border: "1px solid var(--rule)",
          marginBottom: 10,
        }}
      >
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Your position
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Owed to you</span>
          <span className="mono tnum" style={{ fontSize: 12, fontWeight: 500, color: "var(--pos)" }}>
            {formatInr(totalOwedToYou)}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>You owe</span>
          <span className="mono tnum" style={{ fontSize: 12, fontWeight: 500, color: "var(--neg)" }}>
            {formatInr(totalYouOwe)}
          </span>
        </div>
      </div>

      {/* Me */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 4px" }}>
        <Avatar name={userName} id={userId} size={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              color: "var(--ink)",
            }}
          >
            {userName}
          </div>
          <div style={{ fontSize: 10, color: "var(--ink-3)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {userRoleLabel}
          </div>
        </div>
        <ThemeToggle compact />
      </div>

      <form action="/auth/signout" method="post" style={{ marginTop: 8 }}>
        <button
          type="submit"
          className="btn btn-ghost"
          style={{ width: "100%", height: 34, fontSize: 12, fontWeight: 500, color: "var(--ink-3)" }}
        >
          Sign out
        </button>
      </form>
    </aside>
  );
}
