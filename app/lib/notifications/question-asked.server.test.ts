import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { buildQuestionAsked } from "./question-asked.server";
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

describe("question-asked", () => {
  it("goes to the course's Instructor, from the Student, linking to the questions screen", () => {
    const question = comment(sam.id);

    const notification = buildQuestionAsked(db, question.id);

    expect(notification).toEqual({
      type: "question-asked",
      recipients: [{ id: String(base.instructor.id), name: "Test Instructor" }],
      actorId: String(sam.id),
      data: {
        studentName: "Sam Student",
        lessonTitle: "Hello World",
        courseTitle: "Test Course",
        url: "/instructor/questions",
      },
    });
  });

  it("names the Student, the lesson and the course", () => {
    const question = comment(sam.id);

    const notification = buildQuestionAsked(db, question.id);

    if (!notification) throw new Error("Expected a Notification");
    expect(textOf(notification)).toBe(
      "**Sam Student** asked a question on **Hello World** in **Test Course**"
    );
  });

  it("is nothing for a top-level comment by the course's own Instructor", () => {
    const post = comment(base.instructor.id);

    expect(buildQuestionAsked(db, post.id)).toBeNull();
  });

  it("is nothing for a reply", () => {
    const question = comment(base.user.id);
    const reply = comment(sam.id, question.id);

    expect(buildQuestionAsked(db, reply.id)).toBeNull();
  });

  it("leaves the comment's text out of the snapshot", () => {
    const question = comment(sam.id);

    const notification = buildQuestionAsked(db, question.id);

    expect(JSON.stringify(notification)).not.toContain("Secret words");
  });

  it("is nothing for a comment that doesn't exist", () => {
    expect(buildQuestionAsked(db, 9999)).toBeNull();
  });
});
