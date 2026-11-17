import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { buildCommentReplied } from "./comment-replied.server";
import { fileFeed } from "./feed.server";
import { renderNotification } from "./render";
import type { Notification } from "./notification";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lesson: typeof schema.lessons.$inferSelect;
let sam: typeof schema.users.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  const mod = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();
  lesson = db
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: "Hello World", position: 1 })
    .returning()
    .get();
  sam = db
    .insert(schema.users)
    .values({ name: "Sam Student", email: "sam@example.com", role: UserRole.Student })
    .returning()
    .get();
});

function comment(userId: number, parentId: number | null = null) {
  return db
    .insert(schema.comments)
    .values({
      lessonId: lesson.id,
      userId,
      parentId,
      body: "Secret words nobody else should store",
    })
    .returning()
    .get();
}

/** The rendered text, with bold parts wrapped in `**`. */
function textOf(notification: Notification) {
  return renderNotification(notification)
    .parts.map((part) => (part.bold ? `**${part.text}**` : part.text))
    .join("");
}

describe("comment-replied", () => {
  it("goes only to the top-level comment's author, from the replier, linking to the comment", () => {
    const question = comment(base.user.id);
    const reply = comment(sam.id, question.id);

    const notification = buildCommentReplied(db, reply.id);

    expect(notification).toEqual({
      type: "comment-replied",
      recipients: [{ id: String(base.user.id), name: "Test User" }],
      actorId: String(sam.id),
      data: {
        replierName: "Sam Student",
        lessonTitle: "Hello World",
        url: `/courses/test-course/lessons/${lesson.id}#comment-${question.id}`,
      },
    });
  });

  it("reads as the replier replying on the lesson", () => {
    const question = comment(base.user.id);
    const reply = comment(sam.id, question.id);

    const notification = buildCommentReplied(db, reply.id);

    if (!notification) throw new Error("Expected a Notification");
    expect(textOf(notification)).toBe(
      "**Sam Student** replied to your comment on **Hello World**"
    );
  });

  it("goes to the top-level author, not the Instructor, when the Instructor replies", () => {
    const question = comment(base.user.id);
    const reply = comment(base.instructor.id, question.id);

    const notification = buildCommentReplied(db, reply.id);

    expect(notification?.recipients).toEqual([
      { id: String(base.user.id), name: "Test User" },
    ]);
    expect(notification?.actorId).toBe(String(base.instructor.id));
  });

  it("never notifies the Instructor about a reply under a Student's question", () => {
    const question = comment(base.user.id);
    const reply = comment(sam.id, question.id);

    const notification = buildCommentReplied(db, reply.id);

    expect(notification?.recipients.map((r) => r.id)).not.toContain(
      String(base.instructor.id)
    );
  });

  it("notifies nobody when you reply under your own comment", async () => {
    const question = comment(base.user.id);
    const reply = comment(base.user.id, question.id);
    const feed = fileFeed(
      join(mkdtempSync(join(tmpdir(), "comment-replied-")), "feed.json")
    );

    const notification = buildCommentReplied(db, reply.id);
    if (notification) await feed.notify(notification);

    expect(await feed.unreadCount(String(base.user.id))).toBe(0);
    expect(await feed.unreadCount(String(base.instructor.id))).toBe(0);
  });

  it("leaves the comment's text out of the snapshot", () => {
    const question = comment(base.user.id);
    const reply = comment(sam.id, question.id);

    const notification = buildCommentReplied(db, reply.id);

    expect(JSON.stringify(notification)).not.toContain("Secret words");
  });

  it("is nothing for a top-level comment", () => {
    const question = comment(base.user.id);

    expect(buildCommentReplied(db, question.id)).toBeNull();
  });

  it("is nothing for a comment that doesn't exist", () => {
    expect(buildCommentReplied(db, 9999)).toBeNull();
  });
});
