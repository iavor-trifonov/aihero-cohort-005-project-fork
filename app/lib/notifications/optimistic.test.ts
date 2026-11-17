import { describe, expect, it } from "vitest";
import {
  allReadHasLanded,
  NO_OVERRIDES,
  showOptimistically,
  type Overrides,
} from "./optimistic";

// Newest first, as the feed lists them.
const items = [
  { id: "c", insertedAt: "2026-11-18T11:00:00Z", read: false },
  { id: "b", insertedAt: "2026-11-18T10:00:00Z", read: true },
  { id: "a", insertedAt: "2026-11-18T09:00:00Z", read: false },
];

function show(overrides: Partial<Overrides>, status: "all" | "unread" = "all") {
  const view = showOptimistically(
    { status, items, unreadCount: 2 },
    { ...NO_OVERRIDES, ...overrides }
  );
  return {
    rows: view.items.map((item) => `${item.id}:${item.read ? "read" : "unread"}`),
    unreadCount: view.unreadCount,
  };
}

describe("showOptimistically", () => {
  it("shows the feed as loaded when nothing is pending", () => {
    expect(show({})).toEqual({
      rows: ["c:unread", "b:read", "a:unread"],
      unreadCount: 2,
    });
  });

  it("shows a row mark that is still in flight, and adjusts the count", () => {
    expect(show({ pending: { c: true, b: false } })).toEqual({
      rows: ["c:read", "b:unread", "a:unread"],
      unreadCount: 2,
    });
    expect(show({ pending: { a: true } }).unreadCount).toBe(1);
  });

  it("shows everything up to Mark all as read as read, and newer arrivals as unread", () => {
    expect(show({ allReadThrough: "2026-11-18T10:30:00Z" })).toEqual({
      rows: ["c:unread", "b:read", "a:read"],
      unreadCount: 1,
    });
    expect(show({ allReadThrough: "2026-11-18T11:00:00Z" }).unreadCount).toBe(0);
  });

  it("lets a row marked since Mark all as read keep its own state", () => {
    expect(
      show({ allReadThrough: "2026-11-18T11:00:00Z", own: { a: false } })
    ).toEqual({ rows: ["c:read", "b:read", "a:unread"], unreadCount: 1 });
  });

  it("drops rows shown as read from the Unread tab", () => {
    const unreadOnly = items.filter((item) => !item.read);
    const view = showOptimistically(
      { status: "unread", items: unreadOnly, unreadCount: 2 },
      { ...NO_OVERRIDES, pending: { c: true } }
    );
    expect(view.items.map((item) => item.id)).toEqual(["a"]);
    expect(view.unreadCount).toBe(1);
  });
});

describe("allReadHasLanded", () => {
  it("is true once the loaded feed has nothing unread up to Mark all as read", () => {
    const through = "2026-11-18T10:30:00Z";
    expect(allReadHasLanded(items, through)).toBe(false);

    const landed = items.map((item) =>
      item.insertedAt <= through ? { ...item, read: true } : item
    );
    expect(allReadHasLanded(landed, through)).toBe(true);
  });
});
