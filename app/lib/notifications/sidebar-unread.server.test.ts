import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fileFeed, type NotificationFeed } from "./feed.server";
import { sidebarUnreadCount } from "./sidebar-unread.server";

function emptyFeed(): NotificationFeed {
  return fileFeed(join(mkdtempSync(join(tmpdir(), "feed-")), "n.json"));
}

describe("sidebarUnreadCount", () => {
  it("gives the person's unread count", async () => {
    const feed = emptyFeed();
    await feed.notify({
      type: "refund-request-raised",
      recipients: [{ id: "1", name: "Alice Admin" }],
      actorId: "3",
      data: {
        buyerName: "Bea Buyer",
        courseTitle: "Test Course",
        purchaseKind: "individual_purchase",
        url: "/admin/refunds",
      },
    });

    expect(await sidebarUnreadCount(feed, "1")).toBe(1);
    expect(await sidebarUnreadCount(feed, "2")).toBe(0);
  });

  it("gives null, never rejecting, when the count call fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const feed: NotificationFeed = {
      ...emptyFeed(),
      unreadCount: () => Promise.reject(new Error("Knock is down")),
    };

    await expect(sidebarUnreadCount(feed, "1")).resolves.toBeNull();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
