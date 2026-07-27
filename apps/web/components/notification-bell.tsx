"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiClient, NotificationDto } from "../lib/api";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";

// How often the badge re-checks for new notifications. Polling (rather than a
// socket) keeps the self-hosted deployment free of extra infrastructure; the
// endpoint is a single indexed count query.
const POLL_MS = 30_000;

// 1.7e: the notification center — a bell with an unread badge in the shell top
// bar, opening a feed of the signed-in user's own notifications (newest first).
// Shared by both portals: the API derives the recipient from the session, so the
// same component serves staff and investors unchanged.
export const NotificationBell = ({
  locale,
  api,
  token,
}: {
  locale: Locale;
  api: ApiClient;
  token: string;
}) => {
  const t = dictionaries[locale];
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationDto[]>([]);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // A failed poll must never break the shell it lives in — the bell degrades to
  // "nothing new" rather than throwing into the surrounding page.
  const refreshCount = useCallback(() => {
    api
      .unreadNotificationCount(token)
      .then(setUnread)
      .catch(() => {
        /* transient: keep the last known count */
      });
  }, [api, token]);

  const refreshList = useCallback(() => {
    api
      .listNotifications(token)
      .then(setItems)
      .catch(() => {
        setItems([]);
      });
  }, [api, token]);

  useEffect(() => {
    refreshCount();
    const timer = setInterval(refreshCount, POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [refreshCount]);

  // Close on outside click so the panel behaves like a normal popover.
  useEffect(() => {
    if (!open) return;
    const onDocumentClick = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocumentClick);
    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      refreshList();
    }
  };

  const markOne = (id: string) => {
    void api
      .markNotificationRead(token, id)
      .then(() => {
        refreshList();
        refreshCount();
      })
      .catch(() => {
        /* surfaced by the unchanged unread state */
      });
  };

  const markAll = () => {
    void api
      .markAllNotificationsRead(token)
      .then(() => {
        refreshList();
        refreshCount();
      })
      .catch(() => {
        /* surfaced by the unchanged unread state */
      });
  };

  return (
    <div className="notifications" ref={panelRef}>
      <button
        type="button"
        className="notifications__bell"
        onClick={toggle}
        aria-label={`${t.notificationsTitle}${unread > 0 ? ` (${String(unread)} ${t.notificationsUnreadLabel})` : ""}`}
        aria-expanded={open}
      >
        <span aria-hidden="true">◔</span>
        {unread > 0 ? (
          <span className="notifications__badge" data-testid="notification-badge">
            {unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="notifications__panel" role="dialog" aria-label={t.notificationsTitle}>
          <div className="notifications__header">
            <span className="notifications__title">{t.notificationsTitle}</span>
            {items.some((n) => !n.read) ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={markAll}>
                {t.notificationsMarkAllRead}
              </button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <p className="notifications__empty">{t.notificationsEmpty}</p>
          ) : (
            <ul className="notifications__list">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={n.read ? "notification" : "notification notification--unread"}
                >
                  <div className="notification__text">
                    <p className="notification__title">{n.title}</p>
                    <p className="notification__body">{n.body}</p>
                    <time className="notification__time" dateTime={n.createdAt}>
                      {new Date(n.createdAt).toLocaleString(locale)}
                    </time>
                  </div>
                  {n.read ? null : (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => {
                        markOne(n.id);
                      }}
                    >
                      {t.notificationsMarkRead}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
};
