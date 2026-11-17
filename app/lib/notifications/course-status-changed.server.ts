import { eq } from "drizzle-orm";
import { courses, users, type CourseStatus } from "~/db/schema";
import type { Notification } from "./notification";
import { toRecipient, type Db } from "./recipients.server";

/**
 * "{Course} was published / archived / moved back to draft", to the course's
 * Instructor. Built once the status update has committed, given the status it
 * had before; nothing when the status didn't change or the course is gone.
 */
export function buildCourseStatusChanged(
  db: Db,
  courseId: number,
  previousStatus: CourseStatus,
  adminId: number
): Notification | null {
  const found = db
    .select({
      courseTitle: courses.title,
      status: courses.status,
      instructorId: users.id,
      instructorName: users.name,
    })
    .from(courses)
    .innerJoin(users, eq(courses.instructorId, users.id))
    .where(eq(courses.id, courseId))
    .get();

  if (!found || found.status === previousStatus) return null;

  return {
    type: "course-status-changed",
    recipients: [
      toRecipient({ id: found.instructorId, name: found.instructorName }),
    ],
    actorId: String(adminId),
    data: {
      courseTitle: found.courseTitle,
      status: found.status,
      url: `/instructor/${courseId}`,
    },
  };
}
