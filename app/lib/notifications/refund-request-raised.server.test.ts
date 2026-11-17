import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { buildRefundRequestRaised } from "./refund-request-raised.server";
import { renderNotification } from "./render";
import type { Notification } from "./notification";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let pat: typeof schema.users.$inferSelect;
let quinn: typeof schema.users.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  pat = addUser("Pat Admin", UserRole.Admin);
  quinn = addUser("Quinn Admin", UserRole.Admin);
});

function addUser(name: string, role: UserRole) {
  return db
    .insert(schema.users)
    .values({ name, email: `${name.split(" ")[0].toLowerCase()}@example.com`, role })
    .returning()
    .get();
}

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

/** The rendered text, with bold parts wrapped in `**`. */
function textOf(notification: Notification) {
  return renderNotification(notification)
    .parts.map((part) => (part.bold ? `**${part.text}**` : part.text))
    .join("");
}

describe("refund-request-raised", () => {
  it("goes to every Platform Admin, from the buyer, linking to the refunds screen", () => {
    const purchase = buy(base.user.id);

    const notification = buildRefundRequestRaised(db, purchase.id, base.user.id);

    expect(notification).toEqual({
      type: "refund-request-raised",
      recipients: [
        { id: String(pat.id), name: "Pat Admin" },
        { id: String(quinn.id), name: "Quinn Admin" },
      ],
      actorId: String(base.user.id),
      data: {
        buyerName: "Test User",
        courseTitle: "Test Course",
        purchaseKind: "individual_purchase",
        url: "/admin/refunds",
      },
    });
  });

  it("says which course an Individual Purchase was for", () => {
    const purchase = buy(base.user.id);

    const notification = buildRefundRequestRaised(db, purchase.id, base.user.id);

    if (!notification) throw new Error("Expected a Notification");
    expect(textOf(notification)).toBe(
      "**Test User** asked for a refund on **Test Course**"
    );
  });

  it("says when it is a Team Licence", () => {
    const purchase = buy(base.user.id, 3);

    const notification = buildRefundRequestRaised(db, purchase.id, base.user.id);

    if (!notification) throw new Error("Expected a Notification");
    expect(notification.data).toMatchObject({ purchaseKind: "team_licence" });
    expect(textOf(notification)).toBe(
      "**Test User** asked for a refund on a Team Licence for **Test Course**"
    );
  });

  it("is nothing for a Purchase that doesn't exist", () => {
    expect(buildRefundRequestRaised(db, 9999, base.user.id)).toBeNull();
  });
});
