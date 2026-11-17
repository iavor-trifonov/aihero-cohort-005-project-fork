import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fileFeed, type NotificationFeed } from "./feed.server";
import type { FeedItem, Notification, Recipient } from "./notification";

const ALICE: Recipient = { id: "1", name: "Alice Admin" };
const BOB: Recipient = { id: "2", name: "Bob Admin" };
const BUYER: Recipient = { id: "3", name: "Bea Buyer" };

let path: string;
let feed: NotificationFeed;

beforeEach(() => {
  path = join(mkdtempSync(join(tmpdir(), "feed-")), "notifications.json");
  feed = fileFeed(path);
});

function raised(
  recipients: Recipient[],
  courseTitle = "Test Course",
  actorId = BUYER.id
): Notification {
  return {
    type: "refund-request-raised",
    recipients,
    actorId,
    data: {
      buyerName: BUYER.name,
      courseTitle,
      purchaseKind: "individual_purchase",
      url: "/admin/refunds",
    },
  };
}

// Every test Notification is "raised", so its course title tells them apart.
function titleOf(item: FeedItem): string {
  if (item.type !== "refund-request-raised") throw new Error(item.type);
  return item.data.courseTitle;
}

function titles(items: FeedItem[]) {
  return items.map(titleOf);
}

describe("fileFeed", () => {
  it("delivers a Notification to every recipient as unread", async () => {
    await feed.notify(raised([ALICE, BOB]));

    for (const recipient of [ALICE, BOB]) {
      const items = await feed.list(recipient.id, { status: "all" });
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        type: "refund-request-raised",
        actorId: BUYER.id,
        read: false,
        data: { courseTitle: "Test Course", url: "/admin/refunds" },
      });
      expect(await feed.unreadCount(recipient.id)).toBe(1);
    }
  });

  it("never notifies the actor about their own action", async () => {
    await feed.notify(raised([ALICE, BOB], "Test Course", ALICE.id));

    expect(await feed.list(ALICE.id, { status: "all" })).toEqual([]);
    expect(await feed.unreadCount(ALICE.id)).toBe(0);
    expect(await feed.list(BOB.id, { status: "all" })).toHaveLength(1);
  });

  it("sends nothing when the actor was the only recipient", async () => {
    await feed.notify(raised([ALICE], "Test Course", ALICE.id));
    await feed.notify(raised([]));

    expect(await feed.list(ALICE.id, { status: "all" })).toEqual([]);
    expect(await feed.unreadCount(ALICE.id)).toBe(0);
  });

  it("sends nothing when a builder had nothing to send", async () => {
    await expect(feed.notify(null)).resolves.toBeUndefined();

    expect(await feed.list(ALICE.id, { status: "all" })).toEqual([]);
  });

  it("never throws when sending fails, and logs the workflow key, recipient ids and error", async () => {
    // A directory where the file should be makes every write fail.
    const broken = fileFeed(mkdtempSync(join(tmpdir(), "feed-broken-")));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(broken.notify(raised([ALICE, BOB]))).resolves.toBeUndefined();

    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("refund-request-raised"),
      expect.objectContaining({ recipientIds: [ALICE.id, BOB.id] }),
      expect.anything()
    );
    errorLog.mockRestore();
  });

  it("lists the newest 50 first", async () => {
    for (let n = 1; n <= 52; n++) {
      await feed.notify(raised([ALICE], `Course ${n}`));
    }

    const items = await feed.list(ALICE.id, { status: "all" });

    expect(items).toHaveLength(50);
    expect(titleOf(items[0])).toBe("Course 52");
    expect(titleOf(items[49])).toBe("Course 3");
    expect(await feed.unreadCount(ALICE.id)).toBe(52);
  });
});

describe("read and unread", () => {
  async function sendThree() {
    for (const title of ["First", "Second", "Third"]) {
      await feed.notify(raised([ALICE], title));
    }
    return feed.list(ALICE.id, { status: "all" });
  }

  it("marks one item read, which drops it from Unread and the count", async () => {
    const [third] = await sendThree();

    await feed.markRead(ALICE.id, third.id);

    expect(await feed.unreadCount(ALICE.id)).toBe(2);
    expect(titles(await feed.list(ALICE.id, { status: "unread" }))).toEqual([
      "Second",
      "First",
    ]);
    const all = await feed.list(ALICE.id, { status: "all" });
    expect(all.map((item) => [titleOf(item), item.read])).toEqual([
      ["Third", true],
      ["Second", false],
      ["First", false],
    ]);
  });

  it("marks a read item unread again", async () => {
    const [third] = await sendThree();
    await feed.markRead(ALICE.id, third.id);

    await feed.markUnread(ALICE.id, third.id);

    expect(await feed.unreadCount(ALICE.id)).toBe(3);
    expect(titles(await feed.list(ALICE.id, { status: "unread" }))).toEqual([
      "Third",
      "Second",
      "First",
    ]);
  });

  it("marks everything read", async () => {
    await sendThree();

    await feed.markAllRead(ALICE.id);

    expect(await feed.unreadCount(ALICE.id)).toBe(0);
    expect(await feed.list(ALICE.id, { status: "unread" })).toEqual([]);
    expect(await feed.list(ALICE.id, { status: "all" })).toHaveLength(3);
  });

  it("keeps each person's feed separate", async () => {
    await feed.notify(raised([ALICE, BOB]));
    const [alicesItem] = await feed.list(ALICE.id, { status: "all" });

    await feed.markAllRead(ALICE.id);
    await feed.markUnread(BOB.id, alicesItem.id);
    await feed.notify(raised([BOB], "Only for Bob"));

    expect(await feed.unreadCount(ALICE.id)).toBe(0);
    expect(titles(await feed.list(ALICE.id, { status: "all" }))).toEqual([
      "Test Course",
    ]);
    expect(await feed.unreadCount(BOB.id)).toBe(2);
  });

  it("keeps the feed across a fresh fileFeed on the same path", async () => {
    const [third] = await sendThree();
    await feed.markRead(ALICE.id, third.id);

    const restarted = fileFeed(path);

    expect(await restarted.unreadCount(ALICE.id)).toBe(2);
    expect(titles(await restarted.list(ALICE.id, { status: "all" }))).toEqual([
      "Third",
      "Second",
      "First",
    ]);
  });
});
