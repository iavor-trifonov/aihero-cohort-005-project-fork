import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  MAX_NOTE_LENGTH,
  getNote,
  isBookmarked,
  listBookmarks,
  listNotes,
  saveNote,
  toggleBookmark,
} from "./bookmarks-and-notes.server";
import { approveRefundRequest, raiseRefundRequest } from "./refunds.server";
import { fakeNotifications } from "./notifications.fake.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);
const LATER = new Date(2026, 9, 7, 9, 30, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({ name, email: `${name.toLowerCase()}@example.com`, role: UserRole.Student })
    .returning()
    .get();
}

describe("bookmarking a Lesson", () => {
  it("bookmarks a Lesson with no Bookmark, and toggling again removes it", () => {
    expect(toggleBookmark(db, base.user.id, lessonIds[0], NOW)).toBe(true);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(true);

    expect(toggleBookmark(db, base.user.id, lessonIds[0], LATER)).toBe(false);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(false);
  });

  it("never leaves a Student with two Bookmarks on one Lesson", () => {
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);

    expect(() =>
      db
        .insert(schema.bookmarks)
        .values({ userId: base.user.id, lessonId: lessonIds[0] })
        .run()
    ).toThrow();
    expect(listBookmarks(db, base.user.id)).toHaveLength(1);
  });
});

describe("saving a Note", () => {
  it("creates the Note, trimmed, on a Lesson with none", () => {
    expect(saveNote(db, base.user.id, lessonIds[0], "  Revisit generics.  ", NOW)).toEqual({
      ok: true,
      note: { body: "Revisit generics.", updatedAt: NOW.toISOString() },
    });
  });

  it("replaces the body and moves the last edited time on when saved again", () => {
    saveNote(db, base.user.id, lessonIds[0], "First thought", NOW);
    saveNote(db, base.user.id, lessonIds[0], "Second thought", LATER);

    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "Second thought",
      updatedAt: LATER.toISOString(),
    });
    expect(listNotes(db, base.user.id)).toHaveLength(1);
  });

  it("keeps the Note as typed, with Markdown characters and line breaks", () => {
    saveNote(db, base.user.id, lessonIds[0], "# not a heading\n*not bold*", NOW);

    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe(
      "# not a heading\n*not bold*"
    );
  });

  it("accepts a Note of exactly 2,000 characters", () => {
    const body = "a".repeat(MAX_NOTE_LENGTH);

    expect(saveNote(db, base.user.id, lessonIds[0], body, NOW)).toMatchObject({
      ok: true,
      note: { body },
    });
  });

  it("refuses a Note over 2,000 characters and keeps the old one", () => {
    saveNote(db, base.user.id, lessonIds[0], "Keep me", NOW);

    expect(
      saveNote(db, base.user.id, lessonIds[0], "a".repeat(MAX_NOTE_LENGTH + 1), LATER)
    ).toEqual({ ok: false, error: "A note must be 2,000 characters or fewer." });
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe("Keep me");
  });

  it("clears the Note when saved empty", () => {
    saveNote(db, base.user.id, lessonIds[0], "Temporary", NOW);

    expect(saveNote(db, base.user.id, lessonIds[0], "   ", LATER)).toEqual({
      ok: true,
      note: null,
    });
    expect(getNote(db, base.user.id, lessonIds[0])).toBeUndefined();
  });
});

describe("the Saved lists", () => {
  it("list only the Student's own rows, newest first, with their Lesson and Course", () => {
    const other = addStudent("Other");
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    toggleBookmark(db, base.user.id, lessonIds[1], LATER);
    toggleBookmark(db, other.id, lessonIds[0], NOW);
    saveNote(db, base.user.id, lessonIds[1], "Older", NOW);
    saveNote(db, base.user.id, lessonIds[0], "Newer", LATER);
    saveNote(db, other.id, lessonIds[0], "Not yours", LATER);

    expect(listBookmarks(db, base.user.id)).toMatchObject([
      { lessonId: lessonIds[1], lessonTitle: "Lesson 2", courseTitle: base.course.title, courseSlug: base.course.slug },
      { lessonId: lessonIds[0], lessonTitle: "Lesson 1", courseTitle: base.course.title },
    ]);
    expect(listNotes(db, base.user.id)).toMatchObject([
      { body: "Newer", lessonId: lessonIds[0], courseTitle: base.course.title },
      { body: "Older", lessonId: lessonIds[1], courseTitle: base.course.title },
    ]);
  });
});

describe("an approved Refund", () => {
  it("leaves the Student's Bookmarks and Notes in place", async () => {
    const notifications = fakeNotifications();
    const admin = db
      .insert(schema.users)
      .values({ name: "Pat Admin", email: "pat@example.com", role: UserRole.Admin })
      .returning()
      .get();
    const purchase = db
      .insert(schema.purchases)
      .values({ userId: base.user.id, courseId: base.course.id, amountPaid: 7900, createdAt: NOW.toISOString() })
      .returning()
      .get();
    db.insert(schema.enrollments).values({ userId: base.user.id, courseId: base.course.id }).run();
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    saveNote(db, base.user.id, lessonIds[0], "Still mine", NOW);

    const raised = await raiseRefundRequest(db, purchase.id, base.user.id, "Not for me.", NOW, notifications);
    if (!raised.ok) throw new Error(raised.error);
    const approved = await approveRefundRequest(db, raised.refundRequestId, admin.id, null, NOW, notifications);

    expect(approved.ok).toBe(true);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe("Still mine");
  });
});
