import { and, eq, isNull, sql } from "drizzle-orm";
import { coupons, courses, purchases, users } from "~/db/schema";
import type { Notification } from "./notification";
import { toRecipient, type Db } from "./recipients.server";

/**
 * "{Student} claimed a Seat on {Course}. {n} of {total} Seats left.", to the
 * Team Admin who bought the Team Licence. Built once the Seat is claimed;
 * nothing when the Seat is gone. A Team Admin claiming their own Seat is the
 * actor, so `notify()` sends it to nobody.
 */
export function buildSeatClaimed(
  db: Db,
  seatId: number,
  studentId: number
): Notification | null {
  const seat = db
    .select({
      purchaseId: coupons.purchaseId,
      courseTitle: courses.title,
      teamAdminId: purchases.userId,
    })
    .from(coupons)
    .innerJoin(purchases, eq(coupons.purchaseId, purchases.id))
    .innerJoin(courses, eq(coupons.courseId, courses.id))
    .where(eq(coupons.id, seatId))
    .get();
  if (!seat) return null;

  const teamAdmin = db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, seat.teamAdminId))
    .get();
  const student = db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, studentId))
    .get();
  if (!teamAdmin || !student) return null;

  const seats = db
    .select({
      total: sql<number>`count(*)`,
      left: sql<number>`count(*) filter (where ${coupons.redeemedByUserId} is null)`,
    })
    .from(coupons)
    // A refunded Team Licence's Unclaimed Seats can never be claimed, so they
    // don't count, the same as on /team.
    .where(
      and(eq(coupons.purchaseId, seat.purchaseId), isNull(coupons.refundedAt))
    )
    .get();

  return {
    type: "seat-claimed",
    recipients: [toRecipient(teamAdmin)],
    actorId: String(studentId),
    data: {
      studentName: student.name,
      courseTitle: seat.courseTitle,
      seatsLeft: seats?.left ?? 0,
      seatsTotal: seats?.total ?? 0,
      url: "/team",
    },
  };
}
