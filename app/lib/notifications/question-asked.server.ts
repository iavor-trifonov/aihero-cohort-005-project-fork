import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { comments, courses, lessons, modules, users } from "~/db/schema";
import type { Notification } from "./notification";
import { toRecipient, type Db } from "./recipients.server";

/**
 * "{Student} asked a question on {Lesson} in {Course}", to the course's
 * Instructor. A question is a top-level comment from anyone but that
 * Instructor. Built once the comment is written; nothing for a reply, for the
 * Instructor's own top-level comment, or for a comment that doesn't exist. The
 * comment's text is never included.
 */
export function buildQuestionAsked(
  db: Db,
  commentId: number
): Notification | null {
  const student = alias(users, "student");
  const instructor = alias(users, "instructor");

  const found = db
    .select({
      parentId: comments.parentId,
      studentId: student.id,
      studentName: student.name,
      instructorId: instructor.id,
      instructorName: instructor.name,
      lessonTitle: lessons.title,
      courseTitle: courses.title,
    })
    .from(comments)
    .innerJoin(student, eq(comments.userId, student.id))
    .innerJoin(lessons, eq(comments.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .innerJoin(instructor, eq(courses.instructorId, instructor.id))
    .where(eq(comments.id, commentId))
    .get();

  if (!found) return null;
  if (found.parentId !== null) return null;
  if (found.studentId === found.instructorId) return null;

  return {
    type: "question-asked",
    recipients: [
      toRecipient({ id: found.instructorId, name: found.instructorName }),
    ],
    actorId: String(found.studentId),
    data: {
      studentName: found.studentName,
      lessonTitle: found.lessonTitle,
      courseTitle: found.courseTitle,
      url: "/instructor/questions",
    },
  };
}
