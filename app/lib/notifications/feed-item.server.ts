import { z } from "zod";
import { CourseStatus } from "~/db/schema";
import type { FeedItem } from "./notification";

// ─── Reading a stored feed item ───
// A feed item comes back from outside our code (Knock, or the dev file), so it
// is parsed rather than trusted. The annotation below makes typecheck fail if
// this schema and `NotificationDataMap` drift apart.

const purchaseKind = z.enum(["individual_purchase", "team_licence"]);

function itemOf<T extends string, D extends z.ZodRawShape>(type: T, data: D) {
  return z.object({
    id: z.string(),
    type: z.literal(type),
    actorId: z.string(),
    data: z.object({ ...data, url: z.string() }),
    insertedAt: z.string(),
    read: z.boolean(),
  });
}

export const feedItemSchema: z.ZodType<FeedItem, z.ZodTypeDef, unknown> =
  z.discriminatedUnion("type", [
    itemOf("refund-request-raised", {
      buyerName: z.string(),
      courseTitle: z.string(),
      purchaseKind,
    }),

    itemOf("refund-request-decided", {
      courseTitle: z.string(),
      decision: z.enum(["approved", "declined"]),
      purchaseKind,
    }),

    itemOf("comment-replied", {
      replierName: z.string(),
      lessonTitle: z.string(),
    }),

    itemOf("question-asked", {
      studentName: z.string(),
      lessonTitle: z.string(),
      courseTitle: z.string(),
    }),

    itemOf("seat-claimed", {
      studentName: z.string(),
      courseTitle: z.string(),
      seatsLeft: z.number(),
      seatsTotal: z.number(),
    }),

    itemOf("course-status-changed", {
      courseTitle: z.string(),
      status: z.nativeEnum(CourseStatus),
    }),
  ]);
