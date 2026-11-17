// PROTOTYPE (wayfinder: "Prototype the in-app notification UI"). Throwaway; do not ship.
//
// Question: how do Notifications look and behave in Cadence?
// Three structurally different variants, switchable via `?variant=A|B|C` (or ← / →):
//   A  Header bell → dropdown popover. Click a row = mark read + navigate. No page.
//   B  "Notifications" nav item with count → full /notifications page (tabs, grouping, per-row actions).
//   C  Footer bell next to your avatar → slide-out panel. Opening it marks everything *seen*
//      (badge clears) but rows stay *unread* until clicked: Knock's seen/read split.
// All three are our own shadcn/Tailwind UI fed by an in-memory fake (what Knock's headless
// hooks would give us). Data is per role, using the six v1 Notifications' exact text.
import { useEffect, useState, useSyncExternalStore } from "react";
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router";
import { Popover, Dialog } from "radix-ui";
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Circle,
  MessageSquare,
  Receipt,
  Reply,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { UserRole } from "~/db/schema";
import { PrototypeSwitcher } from "~/components/prototype-switcher";

// ---------- fake feed ----------

type Kind =
  | "refund-raised"
  | "refund-decided"
  | "reply"
  | "question"
  | "seat-claimed"
  | "course-status";

type Notification = {
  id: string;
  kind: Kind;
  text: string; // **bold** markers for names
  href: string;
  minutesAgo: number;
  seen: boolean;
  read: boolean;
};

type ProtoUser = { id: number; role: UserRole } | null;

const TS = "Introduction to TypeScript";
const NODE = "Building REST APIs with Node.js";
const TW = "Design Systems with Tailwind";

function seed(user: ProtoUser, isTeamAdmin: boolean): Notification[] {
  if (!user) return [];
  const n = (
    kind: Kind,
    text: string,
    href: string,
    minutesAgo: number,
    read = false
  ) => ({ kind, text, href, minutesAgo, read, seen: read });
  let list: Omit<Notification, "id">[] = [];
  if (user.role === UserRole.Admin) {
    list = [
      n("refund-raised", `**Emma Wilson** asked for a refund on **${TS}**`, "/admin/refunds", 4),
      n("refund-raised", `**James Park** asked for a refund on a Team Licence for **${TW}**`, "/admin/refunds", 95),
      n("reply", `**Sarah Chen** replied to your comment on **Installing and Configuring TypeScript**.`, "/courses/introduction-to-typescript/lessons/2#comments", 60 * 26, true),
      n("refund-raised", `**Liam Thompson** asked for a refund on **${NODE}**`, "/admin/refunds", 60 * 24 * 3, true),
    ];
  } else if (user.role === UserRole.Instructor) {
    list = [
      n("question", `**Olivia Martinez** asked a question on **Installing and Configuring TypeScript** in **${TS}**.`, "/instructor/questions", 12),
      n("course-status", `**${TS}** was published.`, "/instructor/1", 50),
      n("question", `**Emma Wilson** asked a question on **HTTP Methods and Status Codes** in **${NODE}**.`, "/instructor/questions", 60 * 5),
      n("reply", `**Liam Thompson** replied to your comment on **Design Tokens**.`, "/courses/design-systems-with-tailwind/lessons/41#comments", 60 * 30, true),
      n("course-status", `**${NODE}** was moved back to draft.`, "/instructor/2", 60 * 24 * 6, true),
    ];
  } else {
    list = [
      n("reply", `**Sarah Chen** replied to your comment on **Installing and Configuring TypeScript**.`, "/courses/introduction-to-typescript/lessons/2#comments", 7),
      n("refund-decided", `Your refund request for **${NODE}** was approved.`, "/courses/building-rest-apis-with-nodejs", 60 * 3),
      n("reply", `**James Park** replied to your comment on **HTTP Methods and Status Codes**.`, "/courses/building-rest-apis-with-nodejs/lessons/22#comments", 60 * 28, true),
      n("refund-decided", `Your refund request for **${TW}** was declined.`, "/courses/design-systems-with-tailwind", 60 * 24 * 4, true),
    ];
  }
  if (isTeamAdmin) {
    list.splice(
      1,
      0,
      n("seat-claimed", `**Olivia Martinez** claimed a Seat on **${TS}**. 3 of 10 Seats left.`, "/team", 30),
      n("seat-claimed", `**Liam Thompson** claimed a Seat on **${TS}**. 4 of 10 Seats left.`, "/team", 60 * 24 * 2, true)
    );
  }
  return list
    .sort((a, b) => a.minutesAgo - b.minutesAgo)
    .map((x, i) => ({ ...x, id: `${user.id}-${i}` }));
}

const store = new Map<string, Notification[]>();
const listeners = new Set<() => void>();
let counter = 0;

function keyOf(user: ProtoUser, isTeamAdmin: boolean) {
  return `${user?.id ?? "anon"}-${isTeamAdmin}`;
}
function get(user: ProtoUser, isTeamAdmin: boolean) {
  const k = keyOf(user, isTeamAdmin);
  if (!store.has(k)) store.set(k, seed(user, isTeamAdmin));
  return store.get(k)!;
}
function set(user: ProtoUser, isTeamAdmin: boolean, next: Notification[]) {
  store.set(keyOf(user, isTeamAdmin), next);
  listeners.forEach((l) => l());
}

function useFeed(user: ProtoUser, isTeamAdmin: boolean) {
  const items = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => get(user, isTeamAdmin),
    () => get(user, isTeamAdmin)
  );
  const update = (f: (n: Notification) => Notification) =>
    set(user, isTeamAdmin, items.map(f));
  return {
    items,
    unread: items.filter((n) => !n.read).length,
    unseen: items.filter((n) => !n.seen).length,
    markRead: (id: string, read = true) =>
      update((n) => (n.id === id ? { ...n, read, seen: true } : n)),
    markAllRead: () => update((n) => ({ ...n, read: true, seen: true })),
    markAllSeen: () => update((n) => ({ ...n, seen: true })),
    simulate: () => {
      const fresh = seed(user, isTeamAdmin)[counter++ % Math.max(1, items.length)];
      if (!fresh) return;
      set(user, isTeamAdmin, [
        { ...fresh, id: `new-${counter}`, minutesAgo: 0, read: false, seen: false },
        ...items,
      ]);
    },
    clear: () => set(user, isTeamAdmin, []),
    reset: () => set(user, isTeamAdmin, seed(user, isTeamAdmin)),
  };
}

// ---------- variant selection ----------

const VARIANTS = [
  { key: "A", name: "Header bell + dropdown" },
  { key: "B", name: "Nav item + page" },
  { key: "C", name: "Footer bell + slide-out" },
];
const LS_KEY = "cadence-notif-proto-variant";

export function useNotifVariant() {
  const [params] = useSearchParams();
  const [stored, setStored] = useState<string | null>(null);
  useEffect(() => setStored(localStorage.getItem(LS_KEY)), []);
  const fromUrl = params.get("variant");
  useEffect(() => {
    if (fromUrl) localStorage.setItem(LS_KEY, fromUrl);
  }, [fromUrl]);
  return fromUrl ?? stored ?? "A";
}

// ---------- shared bits (small, not layout) ----------

function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split("**").map((part, i) =>
        i % 2 ? (
          <strong key={i} className="font-semibold text-foreground">
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function ago(m: number) {
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 60 / 24)}d ago`;
}

const KIND_ICON: Record<Kind, React.ReactNode> = {
  "refund-raised": <Receipt className="size-4" />,
  "refund-decided": <Receipt className="size-4" />,
  reply: <Reply className="size-4" />,
  question: <MessageSquare className="size-4" />,
  "seat-claimed": <UsersRound className="size-4" />,
  "course-status": <ShieldCheck className="size-4" />,
};

function CountBadge({ n, className }: { n: number; className?: string }) {
  if (n === 0) return null;
  return (
    <span
      className={cn(
        "flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white",
        className
      )}
    >
      {n > 9 ? "9+" : n}
    </span>
  );
}

// ---------- Variant A: header bell + dropdown ----------

function VariantABell({ user, isTeamAdmin }: { user: ProtoUser; isTeamAdmin: boolean }) {
  const feed = useFeed(user, isTeamAdmin);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className="relative ml-auto rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          title="Notifications"
        >
          <Bell className="size-4" />
          <CountBadge n={feed.unread} className="absolute -right-0.5 -top-0.5" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="start"
          sideOffset={12}
          className="z-50 w-96 rounded-lg border bg-popover text-popover-foreground shadow-lg"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="font-semibold">Notifications</span>
            {feed.unread > 0 && (
              <button
                onClick={feed.markAllRead}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Mark all as read
              </button>
            )}
          </div>
          {feed.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
              <BellOff className="size-6" />
              You're all caught up.
            </div>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {feed.items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      feed.markRead(n.id);
                      setOpen(false);
                      navigate(n.href);
                    }}
                    className="flex w-full gap-3 px-4 py-3 text-left text-sm hover:bg-accent"
                  >
                    <span className="mt-1.5 w-2 shrink-0">
                      {!n.read && <span className="block size-2 rounded-full bg-blue-600" />}
                    </span>
                    <span className="flex-1">
                      <span className={n.read ? "text-muted-foreground" : ""}>
                        <RichText text={n.text} />
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {ago(n.minutesAgo)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ---------- Variant B: nav item + /notifications page ----------

function VariantBNavItem({ user, isTeamAdmin }: { user: ProtoUser; isTeamAdmin: boolean }) {
  const feed = useFeed(user, isTeamAdmin);
  return (
    <NavLink
      to="/notifications?variant=B"
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )
      }
    >
      <Bell className="size-4" />
      Notifications
      <CountBadge n={feed.unread} className="ml-auto h-5 min-w-5 text-xs" />
    </NavLink>
  );
}

export function NotificationsPagePrototype({
  user,
  isTeamAdmin,
}: {
  user: ProtoUser;
  isTeamAdmin: boolean;
}) {
  const feed = useFeed(user, isTeamAdmin);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const shown = feed.items.filter((n) => tab === "all" || !n.read);
  const groups: [string, Notification[]][] = [
    ["Today", shown.filter((n) => n.minutesAgo < 60 * 24)],
    ["Earlier", shown.filter((n) => n.minutesAgo >= 60 * 24)],
  ];
  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {feed.unread} unread of {feed.items.length}
          </p>
        </div>
        <button
          onClick={feed.markAllRead}
          disabled={feed.unread === 0}
          className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-40"
        >
          <CheckCheck className="size-4" /> Mark all as read
        </button>
      </div>
      <div className="mb-4 flex gap-1 border-b">
        {(["all", "unread"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize",
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
            {t === "unread" && feed.unread > 0 && ` (${feed.unread})`}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <BellOff className="size-8 text-muted-foreground" />
          <div className="font-medium">
            {tab === "unread" ? "No unread notifications" : "No notifications yet"}
          </div>
          <p className="max-w-sm text-sm text-muted-foreground">
            You'll hear here when someone replies to your comments, and about
            Refund Requests, Seats and courses that involve you.
          </p>
        </div>
      ) : (
        groups.map(
          ([label, items]) =>
            items.length > 0 && (
              <section key={label} className="mb-6">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {label}
                </h2>
                <ul className="divide-y rounded-lg border">
                  {items.map((n) => (
                    <li
                      key={n.id}
                      className={cn(
                        "group flex items-center gap-4 px-4 py-3",
                        !n.read && "bg-primary/5"
                      )}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        {KIND_ICON[n.kind]}
                      </span>
                      <Link
                        to={n.href}
                        onClick={() => feed.markRead(n.id)}
                        className="flex-1 text-sm text-muted-foreground hover:underline"
                      >
                        <RichText text={n.text} />
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {ago(n.minutesAgo)}
                      </span>
                      <button
                        onClick={() => feed.markRead(n.id, !n.read)}
                        title={n.read ? "Mark as unread" : "Mark as read"}
                        className="rounded p-1 text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100"
                      >
                        {n.read ? <Circle className="size-4" /> : <Check className="size-4" />}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )
        )
      )}
    </div>
  );
}

// ---------- Variant C: footer bell + slide-out panel ----------

function VariantCBell({ user, isTeamAdmin }: { user: ProtoUser; isTeamAdmin: boolean }) {
  const feed = useFeed(user, isTeamAdmin);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) feed.markAllSeen();
      }}
    >
      <Dialog.Trigger asChild>
        <button
          title="Notifications"
          className="relative rounded-md p-1 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Bell className="size-4" />
          <CountBadge n={feed.unseen} className="absolute -right-1 -top-1" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content className="fixed inset-y-0 left-56 z-50 flex w-[400px] flex-col border-r bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <Dialog.Title className="text-lg font-semibold">Notifications</Dialog.Title>
            <div className="flex items-center gap-2">
              {feed.unread > 0 && (
                <button
                  onClick={feed.markAllRead}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Mark all as read
                </button>
              )}
              <Dialog.Close className="rounded p-1 hover:bg-accent">
                <X className="size-4" />
              </Dialog.Close>
            </div>
          </div>
          <Dialog.Description className="sr-only">Your notifications</Dialog.Description>
          {feed.items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <BellOff className="size-8" />
              Nothing yet.
            </div>
          ) : (
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {feed.items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    feed.markRead(n.id);
                    setOpen(false);
                    navigate(n.href);
                  }}
                  className={cn(
                    "flex w-full gap-3 rounded-lg border p-3 text-left text-sm transition-colors hover:border-primary/50",
                    n.read ? "bg-background text-muted-foreground" : "border-l-4 border-l-primary bg-card"
                  )}
                >
                  <span className="mt-0.5 text-muted-foreground">{KIND_ICON[n.kind]}</span>
                  <span className="flex-1">
                    <RichText text={n.text} />
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {ago(n.minutesAgo)} · {n.read ? "read" : "unread"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------- slots the sidebar mounts ----------

type SlotProps = {
  where: "header" | "nav" | "footer";
  user: ProtoUser;
  isTeamAdmin: boolean;
};

export function NotificationsSlot({ where, user, isTeamAdmin }: SlotProps) {
  const variant = useNotifVariant();
  if (!user) return null;
  if (where === "header" && variant === "A") return <VariantABell user={user} isTeamAdmin={isTeamAdmin} />;
  if (where === "nav" && variant === "B") return <VariantBNavItem user={user} isTeamAdmin={isTeamAdmin} />;
  if (where === "footer" && variant === "C") return <VariantCBell user={user} isTeamAdmin={isTeamAdmin} />;
  return null;
}

export function NotificationsPrototypeBar({ user, isTeamAdmin }: { user: ProtoUser; isTeamAdmin: boolean }) {
  const variant = useNotifVariant();
  const feed = useFeed(user, isTeamAdmin);
  const location = useLocation();
  const navigate = useNavigate();
  const btn = "rounded-full px-2 py-0.5 text-xs hover:bg-white/20";
  return (
    <PrototypeSwitcher
      variants={VARIANTS}
      current={variant}
      onChange={(k) => {
        localStorage.setItem(LS_KEY, k);
        if (k !== "B" && location.pathname === "/notifications") navigate(`/courses?variant=${k}`);
      }}
    >
      <span className="font-mono text-xs text-white/70">
        {feed.items.length} total · {feed.unread} unread · {feed.unseen} unseen
      </span>
      <button className={btn} onClick={feed.simulate}>+ new</button>
      <button className={btn} onClick={feed.clear}>empty</button>
      <button className={btn} onClick={feed.reset}>reset</button>
    </PrototypeSwitcher>
  );
}
