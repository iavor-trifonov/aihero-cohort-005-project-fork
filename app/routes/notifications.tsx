import { useEffect, useState } from "react";
import {
  data,
  isRouteErrorResponse,
  Link,
  useFetcher,
  useFetchers,
} from "react-router";
import { AlertTriangle, BellOff, CheckCheck } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/notifications";
import { getCurrentUserId } from "~/lib/session";
import {
  getNotificationFeed,
  type FeedStatus,
} from "~/lib/notifications/feed.server";
import { applyFeedAction } from "~/lib/notifications/feed-actions.server";
import { userKey, type FeedItem } from "~/lib/notifications/notification";
import { groupByDay } from "~/lib/notifications/feed-view";
import {
  allReadHasLanded,
  showOptimistically,
} from "~/lib/notifications/optimistic";
import {
  NOTIFICATIONS_ACTION,
  NotificationRow,
  useOnSettled,
  type MarkResult,
} from "~/components/notification-row";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

// The person's Notifications (prototype B): All / Unread (n) tabs, rows
// grouped into Today / Earlier, read/unread per row, and Mark all as read.

export function meta() {
  return [
    { title: "Notifications — Cadence" },
    { name: "description", content: "What's happened that concerns you" },
  ];
}

const tabSchema = z.enum(["all", "unread"]).catch("all");

async function requireUserKey(request: Request) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to see your Notifications.", {
      status: 401,
    });
  }

  return userKey(currentUserId);
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const userId = await requireUserKey(request);
  const status = tabSchema.parse(url.searchParams.get("tab"));
  // Both renders use the loader's clock, so relative times hydrate cleanly.
  const now = new Date().toISOString();

  try {
    const feed = getNotificationFeed();
    const [items, unreadCount] = await Promise.all([
      feed.list(userId, { status }),
      feed.unreadCount(userId),
    ]);
    return { available: true as const, userId, status, now, items, unreadCount };
  } catch (error) {
    // A feed outage shows a message inside the layout, never an error page.
    console.error("Couldn't load Notifications", { userId }, error);
    return { available: false as const, userId, status, now };
  }
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireUserKey(request);

  const result = await applyFeedAction(
    getNotificationFeed(),
    userId,
    await request.formData()
  );

  // An error status skips revalidation, so the row stays as it was.
  if (!result.ok) {
    return data({ error: result.error }, { status: result.status });
  }

  return { ok: true as const };
}

export default function Notifications({ loaderData }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-8">
      {loaderData.available ? (
        // Switching users in DevUI starts the page's local state afresh.
        <NotificationsFeed key={loaderData.userId} {...loaderData} />
      ) : (
        <>
          <h1 className="mb-6 text-2xl font-bold">Notifications</h1>
          <EmptyBox
            title="Notifications are unavailable right now"
            body="Please try again in a little while."
          />
        </>
      )}
    </div>
  );
}

function NotificationsFeed({
  status,
  now,
  items: loadedItems,
  unreadCount: loadedUnreadCount,
}: {
  status: FeedStatus;
  now: string;
  items: FeedItem[];
  unreadCount: number;
}) {
  const [allReadThrough, setAllReadThrough] = useState<string | null>(null);
  const [own, setOwn] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  // Row marks still in flight.
  const pending: Record<string, boolean> = {};
  for (const fetcher of useFetchers()) {
    const intent = fetcher.formData?.get("intent");
    const itemId = fetcher.formData?.get("itemId");
    if (typeof itemId !== "string") continue;
    if (intent === "mark-read") pending[itemId] = true;
    if (intent === "mark-unread") pending[itemId] = false;
  }

  const { items, unreadCount } = showOptimistically(
    { status, items: loadedItems, unreadCount: loadedUnreadCount },
    { pending, own, allReadThrough }
  );

  // Knock marks all read asynchronously: keep showing it until a reload agrees.
  useEffect(() => {
    if (allReadThrough && allReadHasLanded(loadedItems, allReadThrough)) {
      setAllReadThrough(null);
      setOwn({});
    }
  }, [loadedItems, allReadThrough]);

  const markAll = useFetcher<MarkResult>({ key: "notifications-mark-all" });
  useOnSettled(markAll, (result) => {
    if ("error" in result) {
      setAllReadThrough(null);
      setOwn({});
      setError(result.error);
    }
  });

  function markAllRead() {
    if (loadedItems.length === 0) return;
    setError(null);
    setOwn({});
    // Everything up to the newest row loaded; newer arrivals stay unread.
    setAllReadThrough(
      loadedItems.reduce(
        (newest, item) => (item.insertedAt > newest ? item.insertedAt : newest),
        loadedItems[0].insertedAt
      )
    );
    markAll.submit(
      { intent: "mark-all-read" },
      { method: "post", action: NOTIFICATIONS_ACTION }
    );
  }

  function onMarked(itemId: string, read: boolean, result: MarkResult) {
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    if (allReadThrough) setOwn((current) => ({ ...current, [itemId]: read }));
  }

  const nowDate = new Date(now);

  return (
    <>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">{unreadCount} unread</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={markAllRead}
          disabled={unreadCount === 0}
        >
          <CheckCheck className="size-4" /> Mark all as read
        </Button>
      </div>

      <nav className="mb-4 flex gap-1 border-b">
        <Tab to="/notifications" active={status === "all"}>
          All
        </Tab>
        <Tab to="/notifications?tab=unread" active={status === "unread"}>
          Unread{unreadCount > 0 && ` (${unreadCount})`}
        </Tab>
      </nav>

      {error && (
        <div
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyBox
          title={
            status === "unread"
              ? "No unread notifications"
              : "No notifications yet"
          }
          body="You'll hear here when someone replies to your comments, and about Refund Requests, Seats and courses that involve you."
        />
      ) : (
        groupByDay(items, nowDate).map((group) => (
          <section key={group.label} className="mb-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </h2>
            <ul className="divide-y rounded-lg border">
              {group.items.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  now={nowDate}
                  onMarked={onMarked}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}

function Tab({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "-mb-px border-b-2 px-4 py-2 text-sm font-medium",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}

function EmptyBox({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <BellOff className="size-8 text-muted-foreground" />
      <div className="font-medium">{title}</div>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <Link to="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
