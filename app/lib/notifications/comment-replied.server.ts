import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { comments, courses, lessons, modules, users } from "~/db/schema";
import type { Notification } from "./notification";
import { toRecipient, type Db } from "./recipients.server";

/**
 * "{Replier} replied to your comment on {Lesson}", to the top-level comment's
 * author only (never the Instructor). Built once the reply is written; nothing
 * for a top-level comment or a comment that doesn't exist. The comment's text
 * is never included.
 */
export function buildCommentReplied(
  db: Db,
  replyId: number
): Notification | null {
  const replier = alias(users, "replier");
  const parent = alias(comments, "parent");
  const parentAuthor = alias(users, "parent_author");

  const found = db
    .select({
      replierId: replier.id,
      replierName: replier.name,
      parentId: parent.id,
      parentAuthorId: parentAuthor.id,
      parentAuthorName: parentAuthor.name,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      courseSlug: courses.slug,
    })
    .from(comments)
    .innerJoin(replier, eq(comments.userId, replier.id))
    .innerJoin(parent, eq(comments.parentId, parent.id))
    .innerJoin(parentAuthor, eq(parent.userId, parentAuthor.id))
    .innerJoin(lessons, eq(comments.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(comments.id, replyId))
    .get();

  if (!found) return null;

  return {
    type: "comment-replied",
    recipients: [
      toRecipient({ id: found.parentAuthorId, name: found.parentAuthorName }),
    ],
    actorId: String(found.replierId),
    data: {
      replierName: found.replierName,
      lessonTitle: found.lessonTitle,
      url: `/courses/${found.courseSlug}/lessons/${found.lessonId}#comment-${found.parentId}`,
    },
  };
}
