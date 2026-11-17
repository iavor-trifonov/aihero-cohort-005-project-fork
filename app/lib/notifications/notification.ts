import type { PurchaseKind } from "~/lib/refunds.server";

// ─── Notifications ───
// A Notification is one message in a person's in-app feed (see GLOSSARY.md).
// Its `type` is also the Knock workflow key. Its `data` is a snapshot of the
// names, titles and target URL taken when it was sent: the feed never looks
// anything up in SQLite to show a row, so the text reads as it did then.
//
// Adding a type: give it one entry in `NotificationDataMap` below, one entry in
// the renderer table in `./render.ts`, and its own builder file
// (`./<type>.server.ts`). Each type has its own slot, separated by blank lines,
// so tickets adding different types don't touch the same lines.

/** Who receives a Notification. `id` is `String(users.id)`. */
export type Recipient = { id: string; name: string };

/** The snapshot each Notification type carries. Every type links somewhere. */
export interface NotificationDataMap {
  "refund-request-raised": {
    buyerName: string;
    courseTitle: string;
    purchaseKind: PurchaseKind;
    url: string;
  };

  // "refund-request-decided": #22

  "comment-replied": {
    replierName: string;
    lessonTitle: string;
    url: string;
  };

  "question-asked": {
    studentName: string;
    lessonTitle: string;
    courseTitle: string;
    url: string;
  };

  "seat-claimed": {
    studentName: string;
    courseTitle: string;
    seatsLeft: number;
    seatsTotal: number;
    url: string;
  };

  // "course-status-changed": #25
}

export type NotificationType = keyof NotificationDataMap;

export type NotificationData<T extends NotificationType = NotificationType> =
  NotificationDataMap[T];

/** What a builder returns and what `NotificationFeed.notify` accepts. */
export type Notification = {
  [T in NotificationType]: {
    type: T;
    recipients: Recipient[];
    /** The user whose action caused it, as `String(users.id)`. Never notified. */
    actorId: string;
    data: NotificationDataMap[T];
  };
}[NotificationType];

/** One Notification as it sits in one person's feed. */
export type FeedItem = {
  [T in NotificationType]: {
    id: string;
    type: T;
    actorId: string;
    data: NotificationDataMap[T];
    insertedAt: string;
    read: boolean;
  };
}[NotificationType];

export function userKey(userId: number): string {
  return String(userId);
}
