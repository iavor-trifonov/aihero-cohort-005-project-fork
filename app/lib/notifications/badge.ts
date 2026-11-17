// ─── Sidebar unread badge ───

/** The sidebar badge text for an unread count, or null for no badge. */
export function unreadBadgeLabel(count: number): string | null {
  if (count <= 0) return null;
  return count > 9 ? "9+" : String(count);
}
