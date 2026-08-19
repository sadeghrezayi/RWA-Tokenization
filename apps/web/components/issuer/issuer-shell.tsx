"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createApiClient } from "../../lib/api";
import { useBrowserSession } from "../../lib/use-browser-session";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { AuthPanel } from "../auth-panel";
import { NotificationBell } from "../notification-bell";
import { IssuerSessionProvider } from "./issuer-session";

// An issuer's people sign in with their own person account — there is no
// separate issuer login. What makes this portal theirs is a membership, which
// the landing page reads; someone with none is told so rather than shut out.
const isPerson = (kind: "investor" | "officer") => kind === "investor";

// 3.3e: the issuer portal shell. One nav entry today, because one screen
// exists. Entries appear as the screens behind them do — a link to nothing is
// the fake-button rule wearing a different hat.
export const IssuerShell = ({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) => {
  const t = dictionaries[locale];
  const api = useMemo(() => createApiClient(), []);
  const pathname = usePathname();
  const { status, csrf, reload, clear } = useBrowserSession(api, isPerson);

  const base = `/${locale}`;
  const items = [{ href: `${base}/issuer`, label: t.issuerOrganisationNav, icon: "⬡" }];

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
              void reload();
            }}
          />
        </div>
      </div>
    );
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <IssuerSessionProvider value={{ api, token: csrf, locale }}>
      <div className="shell">
        <aside className="sidebar">
          <Link href={`${base}/issuer`} className="brand sidebar__brand">
            <span className="brand__logo" aria-hidden="true">
              ◈
            </span>
            <span className="sidebar__brand-text">
              <span className="sidebar__brand-name">{t.appTitle}</span>
              <span className="sidebar__brand-sub">{t.issuerPortalTitle}</span>
            </span>
          </Link>

          <nav className="sidebar__nav" aria-label="issuer navigation">
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
                void api.logout(csrf).finally(clear);
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
          {/* The design system's names, not invented ones: `topbar` and
              `content` do not exist in components.css, so this header was
              unstyled from the day it shipped — which is why the notification
              bell overflowed the box it was never given. Caught by the issuer
              portal's first layout contract. */}
          <header className="shell__topbar">
            <NotificationBell locale={locale} api={api} token={csrf} />
          </header>
          <main className="shell__content">{children}</main>
        </div>
      </div>
    </IssuerSessionProvider>
  );
};
