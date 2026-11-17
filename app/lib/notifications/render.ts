import {
  MessageCircleQuestion,
  MessageSquareReply,
  Receipt,
  type LucideIcon,
} from "lucide-react";
import type { NotificationDataMap, NotificationType } from "./notification";

// ─── How each Notification reads ───
// The one place a Notification's text and icon come from, given its `type` and
// snapshot `data`. The text is plain, with names and titles in bold and no
// snippets of what anyone wrote.

export type TextPart = { text: string; bold: boolean };

export type RenderedNotification = {
  icon: LucideIcon;
  parts: TextPart[];
  url: string;
};

type Renderer<T extends NotificationType> = (
  data: NotificationDataMap[T]
) => { icon: LucideIcon; parts: TextPart[] };

const bold = (text: string): TextPart => ({ text, bold: true });
const plain = (text: string): TextPart => ({ text, bold: false });

// One entry per type, each in its own slot separated by blank lines.
const RENDERERS: { [T in NotificationType]: Renderer<T> } = {
  "refund-request-raised": (data) => ({
    icon: Receipt,
    parts: [
      bold(data.buyerName),
      plain(
        data.purchaseKind === "team_licence"
          ? " asked for a refund on a Team Licence for "
          : " asked for a refund on "
      ),
      bold(data.courseTitle),
    ],
  }),

  // "refund-request-decided": #22

  "comment-replied": (data) => ({
    icon: MessageSquareReply,
    parts: [
      bold(data.replierName),
      plain(" replied to your comment on "),
      bold(data.lessonTitle),
    ],
  }),

  "question-asked": (data) => ({
    icon: MessageCircleQuestion,
    parts: [
      bold(data.studentName),
      plain(" asked a question on "),
      bold(data.lessonTitle),
      plain(" in "),
      bold(data.courseTitle),
    ],
  }),

  // "seat-claimed": #24

  // "course-status-changed": #25
};

function renderAs<T extends NotificationType>(
  type: T,
  data: NotificationDataMap[T]
): RenderedNotification {
  return { ...RENDERERS[type](data), url: data.url };
}

/** Works on a Notification being sent or an item already in a feed. */
export function renderNotification(notification: {
  [T in NotificationType]: { type: T; data: NotificationDataMap[T] };
}[NotificationType]): RenderedNotification {
  return renderAs(notification.type, notification.data);
}
