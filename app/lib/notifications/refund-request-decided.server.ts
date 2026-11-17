import { eq, sql } from "drizzle-orm";
import { coupons, courses, purchases, refunds, users, RefundStatus } from "~/db/schema";
import type { Notification } from "./notification";
import { toRecipient, type Db } from "./recipients.server";

/**
 * "Your refund request for {Course} was approved / declined", to the buyer.
 * Built once the decision is written; nothing while the Refund Request is
 * still Open or when it is gone. The decision note is left out on purpose:
 * free text isn't stored with the notification service.
 */
export function buildRefundRequestDecided(
  db: Db,
  refundRequestId: number,
  platformAdminId: number
): Notification | null {
  const found = db
    .select({
      status: refunds.status,
      purchaseId: purchases.id,
      buyerId: users.id,
      buyerName: users.name,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(refunds.id, refundRequestId))
    .get();

  if (!found || found.status === RefundStatus.Open) return null;

  // A Team Licence is the Purchase that granted Seats (see refunds.server.ts).
  const seatCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(coupons)
      .where(eq(coupons.purchaseId, found.purchaseId))
      .get()?.count ?? 0;
  const isTeamLicence = seatCount > 0;

  return {
    type: "refund-request-decided",
    recipients: [toRecipient({ id: found.buyerId, name: found.buyerName })],
    actorId: String(platformAdminId),
    data: {
      courseTitle: found.courseTitle,
      decision:
        found.status === RefundStatus.Approved ? "approved" : "declined",
      purchaseKind: isTeamLicence ? "team_licence" : "individual_purchase",
      url: isTeamLicence ? "/team" : `/courses/${found.courseSlug}`,
    },
  };
}
