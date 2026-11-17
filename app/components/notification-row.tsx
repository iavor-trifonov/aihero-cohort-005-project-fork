import { useEffect, useRef } from "react";
import { Link, useFetcher, useNavigate } from "react-router";
import { Check, Circle } from "lucide-react";
import type { FeedActionResult } from "~/lib/notifications/feed-actions.server";
import type { FeedItem } from "~/lib/notifications/notification";
import { renderNotification } from "~/lib/notifications/render";
import { relativeTime } from "~/lib/notifications/feed-view";
import { cn } from "~/lib/utils";

// One row of the /notifications page (prototype B): a type icon, the text with
// names in bold, a relative time, and a hover button that toggles read ⇄
// unread. Clicking the text marks the row read, then goes to its link.

export const NOTIFICATIONS_ACTION = "/notifications";

/** What the /notifications action answers a mark with. */
export type MarkResult = FeedActionResult;

/** The fetcher key for a row's marks, so the page can see them in flight. */
export function rowFetcherKey(itemId: string) {
  return `notification-${itemId}`;
}

/**
 * Calls `onSettled` once each time a fetcher's submission finishes, with the
 * action's result.
 */
export function useOnSettled<T>(
  fetcher: { state: string; data?: T },
  onSettled: (data: T) => void
) {
  const busy = useRef(false);
  const latest = useRef(onSettled);
  latest.current = onSettled;

  useEffect(() => {
    if (fetcher.state !== "idle") {
      busy.current = true;
      return;
    }
    if (busy.current && fetcher.data !== undefined) {
      busy.current = false;
      latest.current(fetcher.data);
    }
  }, [fetcher.state, fetcher.data]);
}

export function NotificationRow({
  item,
  now,
  onMarked,
}: {
  item: FeedItem;
  now: Date;
  /** A row mark finished: whether it was saved, and the state asked for. */
  onMarked: (itemId: string, read: boolean, result: MarkResult) => void;
}) {
  const { icon: Icon, parts, url } = renderNotification(item);
  const fetcher = useFetcher<MarkResult>({ key: rowFetcherKey(item.id) });
  const navigate = useNavigate();
  const asked = useRef(item.read);
  const openWhenMarked = useRef(false);

  useOnSettled(fetcher, (result) => {
    const open = openWhenMarked.current;
    openWhenMarked.current = false;
    onMarked(item.id, asked.current, result);
    // Only go once the read is saved; on failure the page shows the error
    // and the row stays as it was.
    if (open && result.ok) navigate(url);
  });

  function mark(read: boolean) {
    asked.current = read;
    fetcher.submit(
      { intent: read ? "mark-read" : "mark-unread", itemId: item.id },
      { method: "post", action: NOTIFICATIONS_ACTION }
    );
  }

  function openAndMarkRead(event: React.MouseEvent<HTMLAnchorElement>) {
    // Leave new-tab clicks alone; they just follow the link.
    if (item.read || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    openWhenMarked.current = true;
    mark(true);
  }

  return (
    <li
      className={cn(
        "group flex items-center gap-4 px-4 py-3",
        !item.read && "bg-primary/5"
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <Link
        to={url}
        onClick={openAndMarkRead}
        className="flex-1 text-sm text-muted-foreground hover:underline"
      >
        {parts.map((part, index) =>
          part.bold ? (
            <strong key={index} className="font-semibold text-foreground">
              {part.text}
            </strong>
          ) : (
            <span key={index}>{part.text}</span>
          )
        )}
      </Link>
      <time
        dateTime={item.insertedAt}
        className="shrink-0 text-xs text-muted-foreground"
      >
        {relativeTime(item.insertedAt, now)}
      </time>
      <button
        type="button"
        onClick={() => {
          openWhenMarked.current = false;
          mark(!item.read);
        }}
        title={item.read ? "Mark as unread" : "Mark as read"}
        aria-label={item.read ? "Mark as unread" : "Mark as read"}
        className="rounded p-1 text-muted-foreground opacity-0 hover:bg-accent focus-visible:opacity-100 group-hover:opacity-100"
      >
        {item.read ? <Circle className="size-4" /> : <Check className="size-4" />}
      </button>
    </li>
  );
}
