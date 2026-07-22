"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createApiClient } from "../../lib/api";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { OfficerLogin } from "../officer-login";
import { AdminSessionProvider, OFFICER_TOKEN_KEY } from "./admin-session";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

// FR-PT-3 admin console shell: a persistent left sidebar (grouped nav) + a slim
// top bar + a wide content area. Every section is its own route so the URL,
// browser history, and deep links all work. Auth is gated here once for all
// admin routes and shared to pages via context.
export const AdminShell = ({ locale, children }: { locale: Locale; children: React.ReactNode }) => {
  const t = dictionaries[locale];
  const api = useMemo(() => createApiClient(), []);
  const pathname = usePathname();
  const [token, setToken] = useState<string | undefined>(undefined);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setToken(sessionStorage.getItem(OFFICER_TOKEN_KEY) ?? undefined);
    setHydrated(true);
  }, []);

  const base = `/${locale}/admin`;
  const groups: NavGroup[] = [
    {
      label: t.navGroupMain,
      items: [{ href: `${base}/overview`, label: t.overviewTitle, icon: "◫" }],
    },
    {
      label: t.navGroupInvestors,
      items: [
        { href: `${base}/kyc`, label: t.pendingKycTitle, icon: "◑" },
        { href: `${base}/investors`, label: t.investorsTitle, icon: "◎" },
      ],
    },
    {
      label: t.navGroupAssets,
      items: [
        { href: `${base}/assets`, label: t.assetsTitle, icon: "▤" },
        { href: `${base}/offerings`, label: t.offeringsTitle, icon: "◈" },
        { href: `${base}/distributions`, label: t.distributionsTitle, icon: "❖" },
        { href: `${base}/redemptions`, label: t.redemptionsTitle, icon: "⟲" },
      ],
    },
    {
      label: t.navGroupReporting,
      items: [
        { href: `${base}/registry`, label: t.registryTitle, icon: "▦" },
        { href: `${base}/audit`, label: t.auditTitle, icon: "≡" },
      ],
    },
  ];

  if (!hydrated) {
    return null;
  }

  if (token === undefined) {
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
            onAuthed={(newToken) => {
              sessionStorage.setItem(OFFICER_TOKEN_KEY, newToken);
              setToken(newToken);
            }}
          />
        </div>
      </div>
    );
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <AdminSessionProvider value={{ api, token, locale }}>
      <div className="shell">
        <aside className="sidebar">
          <Link href={`${base}/overview`} className="brand sidebar__brand">
            <span className="brand__logo" aria-hidden="true">
              ◈
            </span>
            <span className="sidebar__brand-text">
              <span className="sidebar__brand-name">{t.appTitle}</span>
              <span className="sidebar__brand-sub">{t.adminTitle}</span>
            </span>
          </Link>

          <nav className="sidebar__nav" aria-label="admin navigation">
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
                sessionStorage.removeItem(OFFICER_TOKEN_KEY);
                setToken(undefined);
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
          </header>
          <div className="shell__content">{children}</div>
        </div>
      </div>
    </AdminSessionProvider>
  );
};
