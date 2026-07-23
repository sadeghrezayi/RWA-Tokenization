"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createApiClient } from "../../lib/api";
import { readCsrfToken } from "../../lib/session";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { AuthPanel } from "../auth-panel";
import { InvestorSessionProvider } from "./investor-session";

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
  // httpOnly cookie session, verified on mount via /auth/session; `csrf` is the
  // readable double-submit token threaded to pages for mutations.
  const [status, setStatus] = useState<"loading" | "authed" | "anon">("loading");
  const [csrf, setCsrf] = useState<string>("");

  useEffect(() => {
    let active = true;
    api
      .getSession()
      .then((session) => {
        if (!active) return;
        if (session.kind === "investor") {
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

  const base = `/${locale}`;
  const items = [
    { href: `${base}/portfolio`, label: t.portfolioNav, icon: "◫" },
    { href: `${base}/offerings`, label: t.offeringsNav, icon: "◈" },
    { href: `${base}/profile`, label: t.profileNav, icon: "◑" },
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
          <AuthPanel
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
    <InvestorSessionProvider value={{ api, token: csrf, locale }}>
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
    </InvestorSessionProvider>
  );
};
