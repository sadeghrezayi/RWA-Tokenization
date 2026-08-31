"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PERMISSIONS, createApiClient } from "../../lib/api";
import { useBrowserSession } from "../../lib/use-browser-session";
import { visibleGroups } from "../../lib/nav-visibility";
import type { NavGroupDef } from "../../lib/nav-visibility";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { OfficerLogin } from "../officer-login";
import { NotificationBell } from "../notification-bell";
import { AdminSessionProvider } from "./admin-session";

// Module-level so it is referentially stable: a fresh arrow on every render
// would restart the session probe in a loop.
const isOfficer = (kind: "investor" | "officer") => kind === "officer";

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
  const {
    status,
    csrf,
    permissions,
    roles,
    reload: loadSession,
    clear: clearSession,
  } = useBrowserSession(api, isOfficer);
  // The admin nav has a dozen entries. Wrapped across a phone screen they
  // pushed the actual page below the fold, so on small screens the nav is
  // disclosed on demand. CSS hides this button at desktop widths, where the
  // nav is always visible.
  const [menuOpen, setMenuOpen] = useState(false);

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
          // 4.2: its own entry rather than a fourth item in the ops work queue
          // — the queue's contents were settled as a product decision.
          href: `${base}/reviews`,
          label: t.dueReviewsTitle,
          icon: "◷",
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
          // 4.3: the evidence behind every asset, waiting on a person. Sits
          // with ASSETS because that is what a reviewer is deciding about.
          href: `${base}/documents`,
          label: t.documentReviewTitle,
          icon: "▤",
          permission: PERMISSIONS.ASSET_MANAGE,
        },
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
          // FR-RA-4: the auditor's verification of distributions against what
          // actually reached holders. REPORTING_READ, so the read-only auditor
          // role sees it through the same permission-filtered nav as everyone.
          href: `${base}/reconciliation`,
          label: t.reconciliationTitle,
          icon: "⚖",
          permission: PERMISSIONS.REPORTING_READ,
        },
        {
          // K-34's residue: allocations holding money for tokens that were
          // never issued. REPORTING_READ, alongside the reconciliation screen —
          // whoever verifies the books is who needs to see stuck escrow.
          href: `${base}/escrow`,
          label: t.escrowAwaitingMintTitle,
          icon: "⧗",
          permission: PERMISSIONS.REPORTING_READ,
        },
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
    <AdminSessionProvider value={{ api, token: csrf, locale, permissions }}>
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
              {/* The person's actual roles. This was hard-coded to "officer"
                  for everyone, which with four distinct staff roles told a
                  checker nothing about whether they were maker or checker, and
                  let an auditor believe they held operator powers. A legacy
                  token carries no roles, so the generic word stands in — it is
                  honest about what is known. */}
              <span className="sidebar__session-value" data-testid="signed-in-as">
                {roles.length > 0 ? roles.join(", ") : t.signedInGenericStaff}
              </span>
            </span>
            <button
              type="button"
              className="nav-link nav-link--muted"
              onClick={() => {
                void api.logout(csrf).finally(clearSession);
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
