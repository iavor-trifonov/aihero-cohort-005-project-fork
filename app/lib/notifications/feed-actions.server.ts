import { z } from "zod";
import { parseFormData } from "~/lib/validation";
import type { NotificationFeed } from "./feed.server";

// ─── Marking Notifications read and unread ───
// What the /notifications route action does with a submitted form. It never
// throws: a bad form or a failing feed comes back as an error the page shows,
// and the row stays as it was.

const feedActionSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("mark-read"), itemId: z.string().min(1) }),
  z.object({ intent: z.literal("mark-unread"), itemId: z.string().min(1) }),
  z.object({ intent: z.literal("mark-all-read") }),
]);

export type FeedIntent = z.infer<typeof feedActionSchema>["intent"];

export type FeedActionResult =
  | { ok: true; intent: FeedIntent }
  | { ok: false; status: number; error: string };

const FAILURE_MESSAGES: Record<FeedIntent, string> = {
  "mark-read": "Couldn't mark that Notification as read. Please try again.",
  "mark-unread": "Couldn't mark that Notification as unread. Please try again.",
  "mark-all-read": "Couldn't mark your Notifications as read. Please try again.",
};

export async function applyFeedAction(
  feed: NotificationFeed,
  userId: string,
  formData: FormData
): Promise<FeedActionResult> {
  const parsed = parseFormData(formData, feedActionSchema);
  if (!parsed.success) {
    return { ok: false, status: 400, error: "Invalid request." };
  }

  const action = parsed.data;
  try {
    if (action.intent === "mark-read") {
      await feed.markRead(userId, action.itemId);
    } else if (action.intent === "mark-unread") {
      await feed.markUnread(userId, action.itemId);
    } else {
      await feed.markAllRead(userId);
    }
  } catch (error) {
    console.error(`Notification "${action.intent}" failed`, { userId }, error);
    return { ok: false, status: 503, error: FAILURE_MESSAGES[action.intent] };
  }

  return { ok: true, intent: action.intent };
}
