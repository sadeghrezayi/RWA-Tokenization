"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createApiClient } from "../../lib/api";
import { readCsrfToken } from "../../lib/session";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { OfficerLogin } from "../officer-login";
import { AdminSessionProvider } from "./admin-session";

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
  // Auth is the httpOnly cookie session — verified once on mount via
  // /auth/session (no token in JS). `csrf` is the readable double-submit token
  // threaded to pages for state-changing requests.
  const [status, setStatus] = useState<"loading" | "authed" | "anon">("loading");
  const [csrf, setCsrf] = useState<string>("");

  useEffect(() => {
    let active = true;
    api
      .getSession()
      .then((session) => {
        if (!active) return;
        if (session.kind === "officer") {
          setCsrf(readCsrfToken() ?? "");
          setStatus("authed");
        } else {
          setStatus("anon");
        }
      })
      .catch(() => {
        if (active) setStatus("anon");
      });
    return () => {
      active = false;
    };
  }, [api]);

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
              setCsrf(readCsrfToken() ?? "");
              setStatus("authed");
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
          </header>
          <div className="shell__content">{children}</div>
        </div>
      </div>
    </AdminSessionProvider>
  );
};
