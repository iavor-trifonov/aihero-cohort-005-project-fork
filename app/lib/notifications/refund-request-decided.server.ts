import { eq } from "drizzle-orm";
import { courses, purchases, refunds, users, RefundStatus } from "~/db/schema";
import { getPurchaseKind } from "~/lib/refunds.server";
import { userKey, type Notification } from "./notification";
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

  const purchaseKind = getPurchaseKind(db, found.purchaseId);

  return {
    type: "refund-request-decided",
    recipients: [toRecipient({ id: found.buyerId, name: found.buyerName })],
    actorId: userKey(platformAdminId),
    data: {
      courseTitle: found.courseTitle,
      decision:
        found.status === RefundStatus.Approved ? "approved" : "declined",
      purchaseKind,
      url:
        purchaseKind === "team_licence"
          ? "/team"
          : `/courses/${found.courseSlug}`,
    },
  };
}
