import type { NotificationFeed } from "./feed.server";

/**
 * The unread count for the sidebar badge. The app layout loader returns this
 * promise un-awaited, so it must never reject: a failing count is logged and
 * becomes null, which shows no badge.
 */
export async function sidebarUnreadCount(
  feed: NotificationFeed,
  userId: string
): Promise<number | null> {
  try {
    return await feed.unreadCount(userId);
  } catch (error) {
    console.error("Unread notification count failed", { userId }, error);
    return null;
  }
}
