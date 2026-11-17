import { data, isRouteErrorResponse, Link } from "react-router";
import { AlertTriangle, Bell } from "lucide-react";
import type { Route } from "./+types/notifications";
import { getCurrentUserId } from "~/lib/session";
import { getNotificationFeed } from "~/lib/notifications/feed.server";
import { userKey, type FeedItem } from "~/lib/notifications/notification";
import { renderNotification } from "~/lib/notifications/render";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

// A basic list of the session user's Notifications, newest first. The full
// page (tabs, grouping, read/unread actions) comes later.

export function meta() {
  return [
    { title: "Notifications — Cadence" },
    { name: "description", content: "What's happened that concerns you" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to see your Notifications.", {
      status: 401,
    });
  }

  const items = await getNotificationFeed().list(userKey(currentUserId), {
    status: "all",
  });

  return { items };
}

function NotificationRow({ item }: { item: FeedItem }) {
  const { icon: Icon, parts, url } = renderNotification(item);

  return (
    <li>
      <Link
        to={url}
        className={cn(
          "flex items-start gap-3 rounded-md px-3 py-3 hover:bg-muted",
          !item.read && "bg-primary/5"
        )}
      >
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-sm">
          {parts.map((part, index) =>
            part.bold ? (
              <strong key={index} className="font-semibold">
                {part.text}
              </strong>
            ) : (
              <span key={index}>{part.text}</span>
            )
          )}
        </span>
        <time
          dateTime={item.insertedAt}
          className="shrink-0 text-xs text-muted-foreground"
        >
          {new Date(item.insertedAt).toLocaleString()}
        </time>
      </Link>
    </li>
  );
}

export default function Notifications({ loaderData }: Route.ComponentProps) {
  const { items } = loaderData;

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-8">
      <h1 className="mb-6 text-3xl font-bold">Notifications</h1>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Bell className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="font-medium">No notifications yet</p>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((item) => (
            <NotificationRow key={item.id} item={item} />
          ))}
        </ul>
      )}
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
