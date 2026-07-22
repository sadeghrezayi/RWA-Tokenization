"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createApiClient } from "../../lib/api";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { AuthPanel } from "../auth-panel";
import { INVESTOR_TOKEN_KEY, InvestorSessionProvider } from "./investor-session";

// FR-PT-1 investor portal shell: the same sidebar chrome as the admin console,
// with the investor's three areas (portfolio, offerings, profile) as routes.
export const InvestorShell = ({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) => {
  const t = dictionaries[locale];
  const api = useMemo(() => createApiClient(), []);
  const pathname = usePathname();
  const [token, setToken] = useState<string | undefined>(undefined);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setToken(sessionStorage.getItem(INVESTOR_TOKEN_KEY) ?? undefined);
    setHydrated(true);
  }, []);

  const base = `/${locale}`;
  const items = [
    { href: `${base}/portfolio`, label: t.portfolioNav, icon: "◫" },
    { href: `${base}/offerings`, label: t.offeringsNav, icon: "◈" },
    { href: `${base}/profile`, label: t.profileNav, icon: "◑" },
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
          <AuthPanel
            locale={locale}
            api={api}
            onAuthed={(newToken) => {
              sessionStorage.setItem(INVESTOR_TOKEN_KEY, newToken);
              setToken(newToken);
            }}
          />
        </div>
      </div>
    );
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <InvestorSessionProvider value={{ api, token, locale }}>
      <div className="shell">
        <aside className="sidebar">
          <Link href={`${base}/portfolio`} className="brand sidebar__brand">
            <span className="brand__logo" aria-hidden="true">
              ◈
            </span>
            <span className="sidebar__brand-text">
              <span className="sidebar__brand-name">{t.appTitle}</span>
              <span className="sidebar__brand-sub">{t.investorPortalTitle}</span>
            </span>
          </Link>

          <nav className="sidebar__nav" aria-label="investor navigation">
            <div className="sidebar__group">
              {items.map((item) => (
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
          </nav>

          <div className="sidebar__footer">
            <button
              type="button"
              className="nav-link nav-link--muted"
              onClick={() => {
                sessionStorage.removeItem(INVESTOR_TOKEN_KEY);
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
    </InvestorSessionProvider>
  );
};
