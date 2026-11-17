import { eq } from "drizzle-orm";
import { courses, purchases, users } from "~/db/schema";
import { getPurchaseKind } from "~/lib/refunds.server";
import { userKey, type Notification } from "./notification";
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

  return {
    type: "refund-request-raised",
    recipients: getPlatformAdmins(db),
    actorId: userKey(buyerId),
    data: {
      buyerName: found.buyerName,
      courseTitle: found.courseTitle,
      purchaseKind: getPurchaseKind(db, purchaseId),
      url: "/admin/refunds",
    },
  };
}
