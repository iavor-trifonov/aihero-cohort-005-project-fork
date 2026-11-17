import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { buildSeatClaimed } from "./seat-claimed.server";
import { fileFeed } from "./feed.server";
import { renderNotification } from "./render";
import type { Notification } from "./notification";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let teamAdmin: typeof schema.users.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  teamAdmin = db
    .insert(schema.users)
    .values({ name: "Tara Admin", email: "tara@example.com", role: UserRole.Student })
    .returning()
    .get();
});

/** A Team Licence bought by the Team Admin, with `seats` Unclaimed Seats. */
function buyTeamLicence(seats: number) {
  const purchase = db
    .insert(schema.purchases)
    .values({ userId: teamAdmin.id, courseId: base.course.id, amountPaid: 7900 })
    .returning()
    .get();
  const team = db.insert(schema.teams).values({}).returning().get();
  return Array.from({ length: seats }, (_, i) =>
    db
      .insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: `SEAT-${purchase.id}-${i}`,
        purchaseId: purchase.id,
      })
      .returning()
      .get()
  );
}

/** Claims a Seat the way `redeem/:code` does. */
function claim(seat: typeof schema.coupons.$inferSelect, userId: number) {
  db.update(schema.coupons)
    .set({ redeemedByUserId: userId, redeemedAt: new Date().toISOString() })
    .where(eq(schema.coupons.id, seat.id))
    .run();
}

function textOf(notification: Notification) {
  return renderNotification(notification)
    .parts.map((part) => (part.bold ? `**${part.text}**` : part.text))
    .join("");
}

describe("seat-claimed", () => {
  it("goes to the Team Admin, from the Student, with Seats left and total, linking to /team", () => {
    const seats = buyTeamLicence(3);
    claim(seats[0], base.user.id);

    const notification = buildSeatClaimed(db, seats[0].id, base.user.id);

    expect(notification).toEqual({
      type: "seat-claimed",
      recipients: [{ id: String(teamAdmin.id), name: "Tara Admin" }],
      actorId: String(base.user.id),
      data: {
        studentName: "Test User",
        courseTitle: "Test Course",
        seatsLeft: 2,
        seatsTotal: 3,
        url: "/team",
      },
    });
  });

  it("reads as who claimed a Seat on which course, and how many are left", () => {
    const seats = buyTeamLicence(3);
    claim(seats[0], teamAdmin.id);
    claim(seats[1], base.user.id);

    const notification = buildSeatClaimed(db, seats[1].id, base.user.id);

    if (!notification) throw new Error("Expected a Notification");
    expect(textOf(notification)).toBe(
      "**Test User** claimed a Seat on **Test Course**. 1 of 3 Seats left."
    );
  });

  it("leaves refunded Seats out of the Seats left and the total, as /team does", () => {
    const seats = buyTeamLicence(4);
    claim(seats[0], base.user.id);
    db.update(schema.coupons)
      .set({ refundedAt: new Date().toISOString() })
      .where(eq(schema.coupons.id, seats[3].id))
      .run();

    const notification = buildSeatClaimed(db, seats[0].id, base.user.id);

    expect(notification?.data).toMatchObject({ seatsLeft: 2, seatsTotal: 3 });
  });

  it("notifies nobody when the Team Admin claims a Seat on their own Team Licence", async () => {
    const seats = buyTeamLicence(2);
    claim(seats[0], teamAdmin.id);
    const feed = fileFeed(
      join(mkdtempSync(join(tmpdir(), "feed-")), "notifications.json")
    );

    const notification = buildSeatClaimed(db, seats[0].id, teamAdmin.id);
    if (!notification) throw new Error("Expected a Notification");
    await feed.notify(notification);

    expect(await feed.list(String(teamAdmin.id), { status: "all" })).toEqual([]);
  });

  it("is nothing for a Seat that doesn't exist", () => {
    expect(buildSeatClaimed(db, 9999, base.user.id)).toBeNull();
  });
});
