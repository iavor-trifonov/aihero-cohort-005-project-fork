import { Knock } from "@knocklabs/node";
import type { FeedListItemsResponse } from "@knocklabs/node/resources/users/feeds";
import { z } from "zod";
import { createFeed, FEED_LIMIT, type NotificationFeed } from "./feed.server";
import type { FeedItem } from "./notification";

// ─── Knock feed (production) ───
// Every person's feed lives in Knock (ADR 0013). Every call goes from our
// server with the secret key, so no user tokens are signed and the browser
// never talks to Knock. A Knock user is `String(users.id)`. Operator setup:
// docs/operations/knock.md.

/**
 * The SDK client for the secret key. It keeps the SDK's default 2 retries but
 * gives up on a request after 5 s instead of 60 s, so a slow Knock never holds
 * up the action or page waiting on it for long.
 */
export function knockClient(apiKey: string): Knock {
  return new Knock({ apiKey, timeout: 5_000, maxRetries: 2 });
}

// A feed item carries the trigger `data` as it was sent: the Notification's
// snapshot plus the `actorId` that `deliver` adds. Its workflow key is the
// Notification type. We wrote both, so the cast trusts our own payload.
function toFeedItem(entry: FeedListItemsResponse): FeedItem {
  const { actorId, ...data } = entry.data ?? {};
  return {
    id: entry.id,
    type: entry.source.key,
    actorId: String(actorId),
    data,
    insertedAt: entry.inserted_at,
    read: entry.read_at != null,
  } as FeedItem;
}

const feedMeta = z.object({ meta: z.object({ unread_count: z.number() }) });

/**
 * A feed backed by Knock, reading and marking the in-app feed `channelId`.
 * Without a channel id, Notifications are still sent (a trigger names only the
 * workflow), but every read or mark fails.
 */
export function knockFeed(
  client: Knock,
  channelId: string | undefined
): NotificationFeed {
  function channel(): string {
    if (!channelId) throw new Error("KNOCK_FEED_CHANNEL_ID is not set");
    return channelId;
  }

  async function requireOwnMessage(userId: string, itemId: string) {
    // A user recipient is referenced by its id alone; an object reference is
    // never a person's feed.
    const { recipient } = await client.messages.get(itemId);
    if (recipient !== userId) {
      throw new Error(`Message ${itemId} was not sent to user ${userId}`);
    }
  }

  return createFeed({
    // The workflow key is the Notification type. Recipients are identified
    // inline as `{ id, name }`, so Knock creates or updates them. The actor
    // rides along in `data` rather than as a Knock actor, so no Knock user is
    // made for someone who isn't a recipient.
    async deliver({ type, recipients, actorId, data }) {
      await client.workflows.trigger(type, {
        recipients: recipients.map(({ id, name }) => ({ id, name })),
        data: { ...data, actorId },
      });
    },

    async list(userId, { status }) {
      const page = await client.users.feeds.listItems(userId, channel(), {
        page_size: FEED_LIMIT,
        status,
      });
      return page.entries.map(toFeedItem);
    },

    async unreadCount(userId) {
      // The typed page hides `meta`, so read it from the raw response.
      const response = await client.users.feeds
        .listItems(userId, channel(), { page_size: 1, status: "unread" })
        .asResponse();
      const body = feedMeta.parse(await response.json());
      return body.meta.unread_count;
    },

    // The secret key can mark anyone's message, so check it was sent to this
    // user first: nobody marks someone else's Notification by its id.
    async markRead(userId, itemId) {
      await requireOwnMessage(userId, itemId);
      await client.messages.markAsRead(itemId);
    },

    async markUnread(userId, itemId) {
      await requireOwnMessage(userId, itemId);
      await client.messages.markAsUnread(itemId);
    },

    // Knock runs this as a bulk operation in the background, so items may
    // still read as unread for a moment after it returns.
    async markAllRead(userId) {
      await client.channels.bulk.updateMessageStatus(channel(), "read", {
        recipient_ids: [userId],
      });
    },
  });
}
