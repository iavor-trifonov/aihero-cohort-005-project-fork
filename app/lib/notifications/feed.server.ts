import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { FeedItem, Notification } from "./notification";

// ─── Notification feed ───
// Every person's in-app feed, behind one interface with an implementation per
// environment, like the mailer. Every read or mark call takes the user id
// (`String(users.id)`) explicitly: there is no "current user" in here.

export type FeedStatus = "all" | "unread";

export interface NotificationFeed {
  /** Sends one Notification. Never throws, and never notifies the actor. */
  notify(notification: Notification): Promise<void>;
  /** The newest items first, at most `FEED_LIMIT` of them. */
  list(userId: string, options: { status: FeedStatus }): Promise<FeedItem[]>;
  unreadCount(userId: string): Promise<number>;
  markRead(userId: string, itemId: string): Promise<void>;
  markUnread(userId: string, itemId: string): Promise<void>;
  markAllRead(userId: string): Promise<void>;
}

export const FEED_LIMIT = 50;

/**
 * What an implementation provides. `deliver` only ever sees a Notification
 * whose recipients are non-empty and exclude the actor, and it may throw:
 * `createFeed` owns those rules so every implementation shares them.
 */
export type FeedBackend = Omit<NotificationFeed, "notify"> & {
  deliver(notification: Notification): Promise<void>;
};

export function createFeed(backend: FeedBackend): NotificationFeed {
  const { deliver, ...reads } = backend;

  return {
    ...reads,

    // The one place the "never about your own action" rule lives.
    async notify(notification) {
      const recipients = notification.recipients.filter(
        (recipient) => recipient.id !== notification.actorId
      );
      if (recipients.length === 0) return;

      // A Notification never blocks the action that caused it: on failure it
      // is logged and dropped.
      try {
        await deliver({ ...notification, recipients });
      } catch (error) {
        console.error(
          `Notification "${notification.type}" was not sent`,
          { recipientIds: recipients.map((recipient) => recipient.id) },
          error
        );
      }
    },
  };
}

// ─── File feed (local dev and tests) ───

type StoredFeeds = Record<string, FeedItem[]>;

function toFeedItem(notification: Notification): FeedItem {
  const { recipients: _recipients, ...sent } = notification;
  return {
    ...sent,
    id: randomUUID(),
    insertedAt: new Date().toISOString(),
    read: false,
  };
}

/**
 * A feed kept in one JSON file, used whenever there is no Knock key. Dev uses
 * `.notifications.json` (gitignored, and deleted by `npm run db:seed`), tests
 * a temporary path. The file is read on every call, so it survives restarts.
 */
export function fileFeed(path: string): NotificationFeed {
  function read(): StoredFeeds {
    if (!existsSync(path)) return {};
    return JSON.parse(readFileSync(path, "utf8")) as StoredFeeds;
  }

  function write(feeds: StoredFeeds) {
    writeFileSync(path, JSON.stringify(feeds, null, 2));
  }

  /** Changes one person's items, stored oldest first, and saves them. */
  function update(userId: string, change: (items: FeedItem[]) => FeedItem[]) {
    const feeds = read();
    feeds[userId] = change(feeds[userId] ?? []);
    write(feeds);
  }

  function setRead(userId: string, itemId: string, read: boolean) {
    update(userId, (items) =>
      items.map((item) => (item.id === itemId ? { ...item, read } : item))
    );
  }

  return createFeed({
    async deliver(notification) {
      const feeds = read();
      for (const recipient of notification.recipients) {
        feeds[recipient.id] = [
          ...(feeds[recipient.id] ?? []),
          toFeedItem(notification),
        ];
      }
      write(feeds);
    },

    async list(userId, { status }) {
      const items = read()[userId] ?? [];
      return items
        .filter((item) => status === "all" || !item.read)
        .reverse()
        .slice(0, FEED_LIMIT);
    },

    async unreadCount(userId) {
      const items = read()[userId] ?? [];
      return items.filter((item) => !item.read).length;
    },

    async markRead(userId, itemId) {
      setRead(userId, itemId, true);
    },

    async markUnread(userId, itemId) {
      setRead(userId, itemId, false);
    },

    async markAllRead(userId) {
      update(userId, (items) => items.map((item) => ({ ...item, read: true })));
    },
  });
}

// ─── Choosing the feed ───

/** Where local dev keeps its feeds. Gitignored; `npm run db:seed` deletes it. */
export const DEV_FEED_PATH = ".notifications.json";

/** The feed for this environment. */
export function getNotificationFeed(): NotificationFeed {
  // #26: use the Knock-backed feed when KNOCK_API_KEY is set.
  return fileFeed(DEV_FEED_PATH);
}
