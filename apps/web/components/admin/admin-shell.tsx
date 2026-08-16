"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PERMISSIONS, createApiClient } from "../../lib/api";
import { visibleGroups } from "../../lib/nav-visibility";
import type { NavGroupDef } from "../../lib/nav-visibility";
import { readCsrfToken } from "../../lib/session";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { OfficerLogin } from "../officer-login";
import { NotificationBell } from "../notification-bell";
import { AdminSessionProvider } from "./admin-session";

// FR-PT-3 admin console shell: a persistent left sidebar (grouped nav) + a slim
// top bar + a wide content area. Every section is its own route so the URL,
// browser history, and deep links all work. Auth is gated here once for all
// admin routes and shared to pages via context.
export const AdminShell = ({ locale, children }: { locale: Locale; children: React.ReactNode }) => {
  const t = dictionaries[locale];
  const api = useMemo(() => createApiClient(), []);
  const pathname = usePathname();
  // Auth is the httpOnly cookie session — verified once on mount via
  // /auth/session (no token in JS). `csrf` is the readable double-submit token
  // threaded to pages for state-changing requests.
  const [status, setStatus] = useState<"loading" | "authed" | "anon">("loading");
  const [csrf, setCsrf] = useState<string>("");
  // The admin nav has a dozen entries. Wrapped across a phone screen they
  // pushed the actual page below the fold, so on small screens the nav is
  // disclosed on demand. CSS hides this button at desktop widths, where the
  // nav is always visible.
  const [menuOpen, setMenuOpen] = useState(false);
  const [permissions, setPermissions] = useState<readonly string[]>([]);

  // Loading the session is shared by the initial mount AND a fresh login: the
  // permissions drive the nav, so logging in must re-read them — flipping the
  // status alone left a signed-in officer with an empty sidebar until reload.
  const loadSession = useCallback(async () => {
    try {
      const session = await api.getSession();
      if (session.kind !== "officer") {
        setStatus("anon");
        return;
      }
      setCsrf(readCsrfToken() ?? "");
      setPermissions(session.permissions);
      setStatus("authed");
    } catch {
      setStatus("anon");
    }
  }, [api]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const base = `/${locale}/admin`;
  // Role-aware nav (1.4d): each item declares the permission it needs; the shell
  // hides items (and empty groups) the signed-in staff user can't use.
  const allGroups: NavGroupDef[] = [
    {
      label: t.navGroupMain,
      items: [
        {
          href: `${base}/ops`,
          label: t.opsTitle,
          icon: "◉",
          permission: PERMISSIONS.REPORTING_READ,
        },
        {
          href: `${base}/overview`,
          label: t.overviewTitle,
          icon: "◫",
          permission: PERMISSIONS.REPORTING_READ,
        },
      ],
    },
    {
      label: t.navGroupInvestors,
      items: [
        {
          href: `${base}/kyc`,
          label: t.pendingKycTitle,
          icon: "◑",
          permission: PERMISSIONS.KYC_REVIEW,
        },
        {
          // Confirming a deposit IS crediting the ledger, so it is gated on the
          // same permission as a direct credit.
          href: `${base}/deposits`,
          label: t.fundingQueueNav,
          icon: "⊕",
          permission: PERMISSIONS.LEDGER_CREDIT,
        },
        {
          href: `${base}/investors`,
          label: t.investorsTitle,
          icon: "◎",
          permission: PERMISSIONS.INVESTOR_READ,
        },
      ],
    },
    {
      label: t.navGroupIssuers,
      items: [
        {
          href: `${base}/issuers`,
          label: t.issuersNav,
          icon: "⬡",
          permission: PERMISSIONS.ISSUER_MANAGE,
        },
      ],
    },
    {
      label: t.navGroupAssets,
      items: [
        {
          href: `${base}/assets`,
          label: t.assetsTitle,
          icon: "▤",
          permission: PERMISSIONS.ASSET_MANAGE,
        },
        {
          href: `${base}/offerings`,
          label: t.offeringsTitle,
          icon: "◈",
          permission: PERMISSIONS.OFFERING_MANAGE,
        },
        {
          href: `${base}/distributions`,
          label: t.distributionsTitle,
          icon: "❖",
          permission: PERMISSIONS.DISTRIBUTION_MANAGE,
        },
        {
          href: `${base}/redemptions`,
          label: t.redemptionsTitle,
          icon: "⟲",
          permission: PERMISSIONS.REDEMPTION_MANAGE,
        },
      ],
    },
    {
      label: t.navGroupReporting,
      items: [
        {
          href: `${base}/registry`,
          label: t.registryTitle,
          icon: "▦",
          permission: PERMISSIONS.REGISTRY_READ,
        },
        {
          href: `${base}/audit`,
          label: t.auditTitle,
          icon: "≡",
          permission: PERMISSIONS.AUDIT_READ,
        },
      ],
    },
    {
      label: t.navGroupAccount,
      items: [
        {
          href: `${base}/approvals`,
          label: t.approvalsNav,
          icon: "☑",
          permission: PERMISSIONS.APPROVAL_DECIDE,
        },
        {
          href: `${base}/security`,
          label: t.securityNav,
          icon: "⛨",
          permission: PERMISSIONS.MFA_SELF,
        },
      ],
    },
  ];
  const groups = visibleGroups(allGroups, permissions);

  if (status === "loading") {
    return null;
  }

  if (status === "anon") {
    return (
      <div className="auth-screen">
        <div className="auth-screen__inner stack">
          <div className="brand brand--lg">
            <span className="brand__logo" aria-hidden="true">
              ◈
            </span>
            <span>{t.appTitle}</span>
          </div>
          <OfficerLogin
            locale={locale}
            api={api}
            onAuthed={() => {
              void loadSession();
            }}
          />
        </div>
      </div>
    );
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <AdminSessionProvider value={{ api, token: csrf, locale }}>
      <div className="shell">
        <aside className="sidebar">
          <Link href={`${base}/ops`} className="brand sidebar__brand">
            <span className="brand__logo" aria-hidden="true">
              ◈
            </span>
            <span className="sidebar__brand-text">
              <span className="sidebar__brand-name">{t.appTitle}</span>
              <span className="sidebar__brand-sub">{t.adminTitle}</span>
            </span>
          </Link>

          <button
            type="button"
            className="sidebar__menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="admin-nav"
            onClick={() => {
              setMenuOpen((open) => !open);
            }}
          >
            <span className="nav-link__icon" aria-hidden="true">
              ☰
            </span>
            {t.menuLabel}
          </button>

          <nav
            id="admin-nav"
            className={menuOpen ? "sidebar__nav sidebar__nav--open" : "sidebar__nav"}
            aria-label="admin navigation"
            onClick={() => {
              // Choosing a destination closes the menu; leaving it open would
              // cover the page the officer just asked for.
              setMenuOpen(false);
            }}
          >
            {groups.map((group) => (
              <div key={group.label} className="sidebar__group">
                <p className="sidebar__group-label">{group.label}</p>
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={isActive(item.href) ? "nav-link nav-link--active" : "nav-link"}
                    aria-current={isActive(item.href) ? "page" : undefined}
                  >
                    <span className="nav-link__icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>

          <div className="sidebar__footer">
            <span className="sidebar__session">
              <span className="sidebar__session-label">{t.signedInAs}</span>
              <span className="sidebar__session-value">officer</span>
            </span>
            <button
              type="button"
              className="nav-link nav-link--muted"
              onClick={() => {
                void api.logout(csrf).finally(() => {
                  setStatus("anon");
                  setCsrf("");
                });
              }}
            >
              <span className="nav-link__icon" aria-hidden="true">
                ⏻
              </span>
              {t.logout}
            </button>
          </div>
        </aside>

        <div className="shell__main">
          <header className="shell__topbar">
            <span className="shell__pill">Pilot · self-hosted</span>
            <NotificationBell locale={locale} api={api} token={csrf} />
          </header>
          <div className="shell__content">{children}</div>
        </div>
      </div>
    </AdminSessionProvider>
  );
};
