import { Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import type { Principal } from "../../application/identity/ports.js";
import type { RecipientKind } from "../../domain/notifications/notification.js";
import {
  ListNotifications,
  type NotificationView,
} from "../../application/notifications/list-notifications.js";
import { GetUnreadCount } from "../../application/notifications/get-unread-count.js";
import { MarkNotificationRead } from "../../application/notifications/mark-notification-read.js";
import { CurrentPrincipal } from "./auth.guard.js";

// The recipient is always derived from the authenticated principal, so these
// endpoints are intrinsically self-scoped — every authenticated user (investor
// or staff) sees and acts on ONLY their own notifications. No @RequirePermission
// is needed (nor correct): there is no shared staff/investor permission, and the
// scoping is by identity, not role.
const recipientOf = (principal: Principal): { kind: RecipientKind; id: string } =>
  principal.kind === "investor"
    ? { kind: "investor", id: principal.investorId }
    : { kind: "staff", id: principal.officerId };

@Controller("notifications")
export class NotificationsController {
  constructor(
    private readonly list: ListNotifications,
    private readonly unread: GetUnreadCount,
    private readonly mark: MarkNotificationRead,
  ) {}

  @Get()
  listMine(@CurrentPrincipal() principal: Principal): Promise<NotificationView[]> {
    const recipient = recipientOf(principal);
    return this.list.forRecipient(recipient.kind, recipient.id);
  }

  @Get("unread-count")
  async unreadCount(@CurrentPrincipal() principal: Principal): Promise<{ count: number }> {
    const recipient = recipientOf(principal);
    return { count: await this.unread.forRecipient(recipient.kind, recipient.id) };
  }

  @Post("read-all")
  @HttpCode(204)
  readAll(@CurrentPrincipal() principal: Principal): Promise<void> {
    const recipient = recipientOf(principal);
    return this.mark.all(recipient.kind, recipient.id);
  }

  @Post(":id/read")
  @HttpCode(204)
  read(@Param("id") id: string, @CurrentPrincipal() principal: Principal): Promise<void> {
    const recipient = recipientOf(principal);
    return this.mark.one(id, recipient.kind, recipient.id);
  }
}
