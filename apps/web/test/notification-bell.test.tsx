import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationBell } from "../components/notification-bell";
import type { NotificationDto } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const unread: NotificationDto = {
  id: "ntf-1",
  type: "approval.pending",
  title: "Approval needed",
  body: "A ledger.credit action awaits your approval: 5000 Rial to inv-1.",
  read: false,
  createdAt: "2026-07-27T10:00:00.000Z",
};
const read: NotificationDto = {
  id: "ntf-2",
  type: "kyc.decided",
  title: "Your KYC was approved",
  body: "Your identity verification is complete.",
  read: true,
  createdAt: "2026-07-26T10:00:00.000Z",
};

const api = (overrides: Parameters<typeof stubApi>[0] = {}) =>
  stubApi({
    listNotifications: vi.fn().mockResolvedValue([unread, read]),
    unreadNotificationCount: vi.fn().mockResolvedValue(1),
    markNotificationRead: vi.fn().mockResolvedValue(undefined),
    markAllNotificationsRead: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });

describe("NotificationBell", () => {
  it("shows the unread count on the bell", async () => {
    render(<NotificationBell locale="en" api={api()} token="csrf" />);
    expect(await screen.findByText("1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /notifications/i })).toBeInTheDocument();
  });

  it("hides the badge when nothing is unread", async () => {
    const unreadNotificationCount = vi.fn().mockResolvedValue(0);
    render(<NotificationBell locale="en" api={api({ unreadNotificationCount })} token="csrf" />);
    await waitFor(() => {
      expect(unreadNotificationCount).toHaveBeenCalled();
    });
    expect(screen.queryByTestId("notification-badge")).not.toBeInTheDocument();
  });

  it("opens the feed on click, newest first, marking unread ones visibly", async () => {
    render(<NotificationBell locale="en" api={api()} token="csrf" />);

    await userEvent.click(await screen.findByRole("button", { name: /notifications/i }));

    const feed = within(screen.getByRole("dialog"));
    expect(feed.getByText("Approval needed")).toBeInTheDocument();
    expect(feed.getByText("Your KYC was approved")).toBeInTheDocument();
    const items = feed.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Approval needed"); // newest first
    expect(items[0]?.className).toContain("notification--unread");
    expect(items[1]?.className).not.toContain("notification--unread");
  });

  it("marks a single notification read and drops the unread count", async () => {
    const markNotificationRead = vi.fn().mockResolvedValue(undefined);
    const unreadNotificationCount = vi.fn().mockResolvedValueOnce(1).mockResolvedValue(0);
    const listNotifications = vi
      .fn()
      .mockResolvedValueOnce([unread, read])
      .mockResolvedValue([{ ...unread, read: true }, read]);
    render(
      <NotificationBell
        locale="en"
        api={api({ markNotificationRead, unreadNotificationCount, listNotifications })}
        token="csrf"
      />,
    );

    await userEvent.click(await screen.findByRole("button", { name: /notifications/i }));
    const feed = within(screen.getByRole("dialog"));
    await userEvent.click(feed.getByRole("button", { name: /mark read/i }));

    await waitFor(() => {
      expect(markNotificationRead).toHaveBeenCalledWith("csrf", "ntf-1");
    });
    await waitFor(() => {
      expect(screen.queryByTestId("notification-badge")).not.toBeInTheDocument();
    });
  });

  it("marks everything read at once", async () => {
    const markAllNotificationsRead = vi.fn().mockResolvedValue(undefined);
    render(<NotificationBell locale="en" api={api({ markAllNotificationsRead })} token="csrf" />);

    await userEvent.click(await screen.findByRole("button", { name: /notifications/i }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: /mark all read/i }),
    );

    await waitFor(() => {
      expect(markAllNotificationsRead).toHaveBeenCalledWith("csrf");
    });
  });

  it("shows an empty state when there is nothing to show", async () => {
    const stub = api({
      listNotifications: vi.fn().mockResolvedValue([]),
      unreadNotificationCount: vi.fn().mockResolvedValue(0),
    });
    render(<NotificationBell locale="en" api={stub} token="csrf" />);

    await userEvent.click(await screen.findByRole("button", { name: /notifications/i }));

    expect(within(screen.getByRole("dialog")).getByText(/No notifications/i)).toBeInTheDocument();
  });

  it("stays usable when the feed cannot be loaded", async () => {
    const stub = api({
      listNotifications: vi.fn().mockRejectedValue(new Error("network down")),
      unreadNotificationCount: vi.fn().mockRejectedValue(new Error("network down")),
    });
    render(<NotificationBell locale="en" api={stub} token="csrf" />);

    // A failed poll must not blow up the shell — the bell still renders.
    const bell = await screen.findByRole("button", { name: /notifications/i });
    await userEvent.click(bell);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
