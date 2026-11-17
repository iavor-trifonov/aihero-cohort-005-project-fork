import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { fileFeed, type NotificationFeed } from "./feed.server";
import { applyFeedAction } from "./feed-actions.server";
import type { Notification } from "./notification";

const ALICE = { id: "1", name: "Alice Admin" };

let feed: NotificationFeed;

beforeEach(() => {
  feed = fileFeed(
    join(mkdtempSync(join(tmpdir(), "feed-actions-")), "notifications.json")
  );
});

function raised(courseTitle: string): Notification {
  return {
    type: "refund-request-raised",
    recipients: [ALICE],
    actorId: "3",
    data: {
      buyerName: "Bea Buyer",
      courseTitle,
      purchaseKind: "individual_purchase",
      url: "/admin/refunds",
    },
  };
}

function form(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

async function readStates() {
  const items = await feed.list(ALICE.id, { status: "all" });
  return items.map((item) => item.read);
}

describe("applyFeedAction", () => {
  beforeEach(async () => {
    await feed.notify(raised("First"));
    await feed.notify(raised("Second"));
  });

  it("marks one item read", async () => {
    const [second] = await feed.list(ALICE.id, { status: "all" });

    const result = await applyFeedAction(
      feed,
      ALICE.id,
      form({ intent: "mark-read", itemId: second.id })
    );

    expect(result).toEqual({ ok: true, intent: "mark-read" });
    expect(await readStates()).toEqual([true, false]);
    expect(await feed.unreadCount(ALICE.id)).toBe(1);
  });

  it("marks a read item unread again", async () => {
    const [second] = await feed.list(ALICE.id, { status: "all" });
    await feed.markRead(ALICE.id, second.id);

    const result = await applyFeedAction(
      feed,
      ALICE.id,
      form({ intent: "mark-unread", itemId: second.id })
    );

    expect(result).toEqual({ ok: true, intent: "mark-unread" });
    expect(await readStates()).toEqual([false, false]);
  });

  it("marks everything read", async () => {
    const result = await applyFeedAction(
      feed,
      ALICE.id,
      form({ intent: "mark-all-read" })
    );

    expect(result).toEqual({ ok: true, intent: "mark-all-read" });
    expect(await feed.unreadCount(ALICE.id)).toBe(0);
  });

  it("rejects an unknown intent or a missing item, changing nothing", async () => {
    for (const fields of [
      { intent: "delete", itemId: "x" },
      { intent: "mark-read" },
      { intent: "mark-unread", itemId: "" },
    ]) {
      const result = await applyFeedAction(feed, ALICE.id, form(fields));
      expect(result).toMatchObject({ ok: false, status: 400 });
    }
    expect(await feed.unreadCount(ALICE.id)).toBe(2);
  });

  it("returns an error when the feed fails, instead of throwing", async () => {
    // A directory where the file should be makes every read and write fail.
    const broken = fileFeed(mkdtempSync(join(tmpdir(), "feed-broken-")));

    for (const intent of ["mark-read", "mark-unread", "mark-all-read"]) {
      const result = await applyFeedAction(
        broken,
        ALICE.id,
        form({ intent, itemId: "some-item" })
      );
      expect(result).toEqual({
        ok: false,
        status: 503,
        error: expect.stringMatching(/couldn't/i),
      });
    }
  });
});
