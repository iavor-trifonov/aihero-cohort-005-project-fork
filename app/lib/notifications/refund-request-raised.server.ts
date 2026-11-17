import { eq, sql } from "drizzle-orm";
import { coupons, courses, purchases, users } from "~/db/schema";
import type { Notification } from "./notification";
import { getPlatformAdmins, type Db } from "./recipients.server";

/**
 * "{Buyer} asked for a refund on {Course}", to every Platform Admin. Built
 * once the Refund Request is written; nothing when the Purchase is gone.
 */
export function buildRefundRequestRaised(
  db: Db,
  purchaseId: number,
  buyerId: number
): Notification | null {
  const found = db
    .select({ buyerName: users.name, courseTitle: courses.title })
    .from(purchases)
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(purchases.id, purchaseId))
    .get();

  if (!found) return null;

  // A Team Licence is the Purchase that granted Seats (see refunds.server.ts).
  const seatCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(coupons)
      .where(eq(coupons.purchaseId, purchaseId))
      .get()?.count ?? 0;

  return {
    type: "refund-request-raised",
    recipients: getPlatformAdmins(db),
    actorId: String(buyerId),
    data: {
      buyerName: found.buyerName,
      courseTitle: found.courseTitle,
      purchaseKind: seatCount > 0 ? "team_licence" : "individual_purchase",
      url: "/admin/refunds",
    },
  };
}
