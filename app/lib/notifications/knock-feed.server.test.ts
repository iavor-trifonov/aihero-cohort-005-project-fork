import { Knock } from "@knocklabs/node";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getNotificationFeed } from "./feed.server";
import { knockClient, knockFeed } from "./knock-feed.server";
import type { Notification } from "./notification";

// These tests never reach Knock: the SDK client is real, but its `fetch` is a
// fake that records each request and answers it, so they check what we ask
// Knock for and how we read its answers.

const CHANNEL = "feed-channel-id";

type Request = {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
};

function fakeKnock(respond: (request: Request) => unknown = () => ({})) {
  const requests: Request[] = [];
  const fetch = async (
    input: string | URL | globalThis.Request,
    init?: RequestInit
  ) => {
    const url = new URL(String(input));
    const request: Request = {
      method: init?.method ?? "GET",
      path: url.pathname,
      query: url.searchParams,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    requests.push(request);
    const body = respond(request);
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const client = new Knock({ apiKey: "sk_test_fake", fetch, maxRetries: 0 });
  return { client, requests };
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg_1",
    __typename: "FeedItem",
    activities: [],
    actors: [],
    blocks: [],
    data: {
      actorId: "3",
      buyerName: "Bea Buyer",
      courseTitle: "Test Course",
      purchaseKind: "individual_purchase",
      url: "/admin/refunds",
    },
    inserted_at: "2026-11-18T09:00:00.000Z",
    updated_at: "2026-11-18T09:00:00.000Z",
    read_at: null,
    source: {
      __typename: "WorkflowSource",
      categories: [],
      key: "refund-request-raised",
      version_id: "v1",
    },
    tenant: null,
    total_activities: 1,
    total_actors: 0,
    ...overrides,
  };
}

function feedPage(entries: unknown[], unreadCount = 0) {
  return {
    entries,
    page_info: { after: null, before: null, page_size: 50 },
    meta: {
      unread_count: unreadCount,
      unseen_count: 0,
      total_count: entries.length,
    },
    vars: {},
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("knockFeed", () => {
  it("lists the newest 50 items of the user's feed channel as FeedItems", async () => {
    const { client, requests } = fakeKnock(() =>
      feedPage([
        entry({ id: "msg_2", read_at: "2026-11-18T10:00:00.000Z" }),
        entry({ id: "msg_1" }),
      ])
    );
    const feed = knockFeed(client, CHANNEL);

    const items = await feed.list("42", { status: "all" });

    expect(requests).toHaveLength(1);
    expect(requests[0].path).toBe(`/v1/users/42/feeds/${CHANNEL}`);
    expect(requests[0].query.get("page_size")).toBe("50");
    expect(requests[0].query.get("status")).toBe("all");
    expect(items).toEqual([
      {
        id: "msg_2",
        type: "refund-request-raised",
        actorId: "3",
        data: {
          buyerName: "Bea Buyer",
          courseTitle: "Test Course",
          purchaseKind: "individual_purchase",
          url: "/admin/refunds",
        },
        insertedAt: "2026-11-18T09:00:00.000Z",
        read: true,
      },
      expect.objectContaining({ id: "msg_1", read: false }),
    ]);
  });

  it("asks Knock for unread items only on the Unread tab", async () => {
    const { client, requests } = fakeKnock(() => feedPage([]));

    await knockFeed(client, CHANNEL).list("42", { status: "unread" });

    expect(requests[0].query.get("status")).toBe("unread");
  });

  it("reads the unread count from the feed's metadata", async () => {
    const { client, requests } = fakeKnock(() => feedPage([entry()], 7));

    const count = await knockFeed(client, CHANNEL).unreadCount("42");

    expect(count).toBe(7);
    expect(requests[0].path).toBe(`/v1/users/42/feeds/${CHANNEL}`);
  });

  const raised: Notification = {
    type: "refund-request-raised",
    recipients: [
      { id: "1", name: "Alice Admin" },
      { id: "3", name: "Bea Buyer" },
    ],
    actorId: "3",
    data: {
      buyerName: "Bea Buyer",
      courseTitle: "Test Course",
      purchaseKind: "individual_purchase",
      url: "/admin/refunds",
    },
  };

  it("triggers the workflow named by the type, for every recipient but the actor", async () => {
    const { client, requests } = fakeKnock(() => ({
      workflow_run_id: "run_1",
    }));

    await knockFeed(client, CHANNEL).notify(raised);

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].path).toBe(
      "/v1/workflows/refund-request-raised/trigger"
    );
    expect(requests[0].body).toEqual({
      recipients: [{ id: "1", name: "Alice Admin" }],
      data: {
        actorId: "3",
        buyerName: "Bea Buyer",
        courseTitle: "Test Course",
        purchaseKind: "individual_purchase",
        url: "/admin/refunds",
      },
    });
  });

  it("logs a failed trigger instead of throwing", async () => {
    const { client } = fakeKnock(
      () => new Response(JSON.stringify({ message: "nope" }), { status: 422 })
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      knockFeed(client, CHANNEL).notify(raised)
    ).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("refund-request-raised"),
      { recipientIds: ["1"] },
      expect.anything()
    );
  });

  /** Answers a message lookup as a message sent to `recipient`. */
  function messageFor(recipient: string) {
    return (request: Request) =>
      request.method === "GET"
        ? { id: "msg_1", channel_id: CHANNEL, recipient }
        : {};
  }

  it("marks one of the user's items read or unread by its message id", async () => {
    const { client, requests } = fakeKnock(messageFor("42"));
    const feed = knockFeed(client, CHANNEL);

    await feed.markRead("42", "msg_1");
    await feed.markUnread("42", "msg_1");

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /v1/messages/msg_1",
      "PUT /v1/messages/msg_1/read",
      "GET /v1/messages/msg_1",
      "DELETE /v1/messages/msg_1/read",
    ]);
  });

  it("refuses to mark an item that was sent to someone else", async () => {
    const { client, requests } = fakeKnock(messageFor("7"));
    const feed = knockFeed(client, CHANNEL);

    await expect(feed.markRead("42", "msg_1")).rejects.toThrow();
    await expect(feed.markUnread("42", "msg_1")).rejects.toThrow();

    expect(requests.map(({ method }) => method)).toEqual(["GET", "GET"]);
  });

  it("marks everything read in the user's feed channel", async () => {
    const { client, requests } = fakeKnock(() => ({}));

    await knockFeed(client, CHANNEL).markAllRead("42");

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].path).toBe(`/v1/channels/${CHANNEL}/messages/bulk/read`);
    expect(requests[0].body).toEqual({ recipient_ids: ["42"] });
  });
});

describe("knockClient", () => {
  it("gives up on Knock after about 5 seconds, with the default 2 retries", () => {
    const client = knockClient("sk_test_fake");

    expect(client.timeout).toBe(5_000);
    expect(client.maxRetries).toBe(2);
  });
});

describe("getNotificationFeed", () => {
  function stubFetch() {
    const fetch = vi.fn(
      async (_input: string | URL | globalThis.Request, _init?: RequestInit) =>
        new Response(JSON.stringify(feedPage([])), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    );
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses Knock when KNOCK_API_KEY is set", async () => {
    const fetch = stubFetch();
    const feed = getNotificationFeed({
      KNOCK_API_KEY: "sk_test_fake",
      KNOCK_FEED_CHANNEL_ID: CHANNEL,
    });

    await feed.list("42", { status: "all" });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toContain(
      `api.knock.app/v1/users/42/feeds/${CHANNEL}`
    );
  });

  it("says loudly that KNOCK_FEED_CHANNEL_ID is missing when KNOCK_API_KEY is set", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    getNotificationFeed({ KNOCK_API_KEY: "sk_test_fake" });

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("KNOCK_FEED_CHANNEL_ID")
    );
  });

  it("uses the file feed when KNOCK_API_KEY is not set", async () => {
    const fetch = stubFetch();
    const feed = getNotificationFeed({ KNOCK_FEED_CHANNEL_ID: CHANNEL });

    await feed.list("no-such-user", { status: "all" });

    expect(fetch).not.toHaveBeenCalled();
  });
});
