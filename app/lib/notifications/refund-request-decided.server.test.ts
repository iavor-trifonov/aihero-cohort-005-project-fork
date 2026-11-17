import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { RefundStatus, UserRole } from "~/db/schema";
import { buildRefundRequestDecided } from "./refund-request-decided.server";
import { renderNotification } from "./render";
import type { Notification } from "./notification";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let pat: typeof schema.users.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  pat = db
    .insert(schema.users)
    .values({ name: "Pat Admin", email: "pat@example.com", role: UserRole.Admin })
    .returning()
    .get();
});

function buy(userId: number, seats = 0) {
  const purchase = db
    .insert(schema.purchases)
    .values({ userId, courseId: base.course.id, amountPaid: 7900 })
    .returning()
    .get();
  if (seats > 0) {
    const team = db.insert(schema.teams).values({}).returning().get();
    for (let i = 0; i < seats; i++) {
      db.insert(schema.coupons)
        .values({
          teamId: team.id,
          courseId: base.course.id,
          code: `SEAT-${purchase.id}-${i}`,
          purchaseId: purchase.id,
        })
        .run();
    }
  }
  return purchase;
}

function refundRequestOn(
  purchaseId: number,
  status: RefundStatus,
  decisionNote: string | null = null
) {
  const decided = status !== RefundStatus.Open;
  return db
    .insert(schema.refunds)
    .values({
      purchaseId,
      status,
      reason: "Not for me.",
      decisionNote,
      requestedAt: new Date().toISOString(),
      resolvedAt: decided ? new Date().toISOString() : null,
      resolvedByUserId: decided ? pat.id : null,
    })
    .returning()
    .get();
}

/** The rendered text, with bold parts wrapped in `**`. */
function textOf(notification: Notification) {
  return renderNotification(notification)
    .parts.map((part) => (part.bold ? `**${part.text}**` : part.text))
    .join("");
}

describe("refund-request-decided", () => {
  it("goes to the buyer, from the Platform Admin, linking an Individual Purchase to the course page", () => {
    const refundRequest = refundRequestOn(buy(base.user.id).id, RefundStatus.Approved);

    const notification = buildRefundRequestDecided(db, refundRequest.id, pat.id);

    expect(notification).toEqual({
      type: "refund-request-decided",
      recipients: [{ id: String(base.user.id), name: "Test User" }],
      actorId: String(pat.id),
      data: {
        courseTitle: "Test Course",
        decision: "approved",
        purchaseKind: "individual_purchase",
        url: `/courses/${base.course.slug}`,
      },
    });
  });

  it("says it was approved", () => {
    const refundRequest = refundRequestOn(buy(base.user.id).id, RefundStatus.Approved);

    const notification = buildRefundRequestDecided(db, refundRequest.id, pat.id);

    if (!notification) throw new Error("Expected a Notification");
    expect(textOf(notification)).toBe(
      "Your refund request for **Test Course** was approved."
    );
  });

  it("says it was declined, and leaves out the decision note", () => {
    const refundRequest = refundRequestOn(
      buy(base.user.id).id,
      RefundStatus.Declined,
      "You finished the course."
    );

    const notification = buildRefundRequestDecided(db, refundRequest.id, pat.id);

    if (!notification) throw new Error("Expected a Notification");
    expect(notification.data).toMatchObject({ decision: "declined" });
    expect(JSON.stringify(notification)).not.toContain("You finished the course.");
    expect(textOf(notification)).toBe(
      "Your refund request for **Test Course** was declined."
    );
  });

  it("links a Team Licence to the team page", () => {
    const refundRequest = refundRequestOn(
      buy(base.user.id, 3).id,
      RefundStatus.Declined,
      "No."
    );

    const notification = buildRefundRequestDecided(db, refundRequest.id, pat.id);

    expect(notification?.data).toEqual({
      courseTitle: "Test Course",
      decision: "declined",
      purchaseKind: "team_licence",
      url: "/team",
    });
  });

  it("is nothing for a Refund Request that is still Open", () => {
    const refundRequest = refundRequestOn(buy(base.user.id).id, RefundStatus.Open);

    expect(buildRefundRequestDecided(db, refundRequest.id, pat.id)).toBeNull();
  });

  it("is nothing for a Refund Request that doesn't exist", () => {
    expect(buildRefundRequestDecided(db, 9999, pat.id)).toBeNull();
  });
});
