// ─── Showing marks before the feed catches up ───
// Knock processes "Mark all as read" asynchronously, so the page shows it
// straight away and keeps showing it until a reload agrees. Row marks show
// while they are in flight. A mark that fails is simply no longer pending, so
// the row goes back to how it was loaded.

type Row = { id: string; insertedAt: string; read: boolean };

export type Overrides = {
  /** Row marks still in flight: item id → read. */
  pending: Record<string, boolean>;
  /** Rows marked one by one since "Mark all as read": item id → read. */
  own: Record<string, boolean>;
  /** The newest `insertedAt` the person saw when they marked all as read. */
  allReadThrough: string | null;
};

export const NO_OVERRIDES: Overrides = {
  pending: {},
  own: {},
  allReadThrough: null,
};

/** Whether a reload agrees with "Mark all as read", so it can stop overriding. */
export function allReadHasLanded(items: Row[], allReadThrough: string): boolean {
  return items.every(
    (item) => item.read || item.insertedAt > allReadThrough
  );
}

export function showOptimistically<T extends Row>(
  view: { status: "all" | "unread"; items: T[]; unreadCount: number },
  overrides: Overrides
): { items: T[]; unreadCount: number } {
  const { pending, own, allReadThrough } = overrides;

  const readOf = (item: T): boolean =>
    pending[item.id] ??
    own[item.id] ??
    (allReadThrough !== null && item.insertedAt <= allReadThrough
      ? true
      : item.read);

  const shown = view.items.map((item) => ({ ...item, read: readOf(item) }));

  // After Mark all as read, everything unread is in the list (anything older
  // than the newest row seen is covered), so the list is the count.
  const unreadCount =
    allReadThrough !== null
      ? shown.filter((item) => !item.read).length
      : Math.max(
          0,
          view.items.reduce(
            (count, item, index) =>
              count + Number(item.read) - Number(shown[index].read),
            view.unreadCount
          )
        );

  return {
    items:
      view.status === "unread" ? shown.filter((item) => !item.read) : shown,
    unreadCount,
  };
}
