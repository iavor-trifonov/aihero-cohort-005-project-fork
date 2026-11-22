import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, desc, eq } from "drizzle-orm";
import type { SQLiteColumn, SQLiteSelect } from "drizzle-orm/sqlite-core";
import * as schema from "~/db/schema";
import { bookmarks, courses, lessons, modules, notes } from "~/db/schema";

// ─── Bookmarks and Notes ───
// A Student's own flag on a Lesson, and their own writing about it. Both are
// private to the Student: nothing here reads another Student's rows, and no
// Instructor or Platform Admin view may call these. See GLOSSARY.md.
//
// Every function takes the database first, so tests can hand in an in-memory
// one. Uses positional parameters (project convention).

export type Db = BetterSQLite3Database<typeof schema>;

export const MAX_NOTE_LENGTH = 2000;

export const NOTE_TOO_LONG = `A note must be ${MAX_NOTE_LENGTH.toLocaleString("en")} characters or fewer.`;

/** What the Student sees of their own Note: the text and when they last edited it. */
export type NoteSummary = { body: string; updatedAt: string };

export function isBookmarked(db: Db, studentId: number, lessonId: number) {
  return !!db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, studentId), eq(bookmarks.lessonId, lessonId)))
    .get();
}

/** Adds the Bookmark if there is none, removes it if there is. Returns whether the Lesson is now bookmarked. */
export function toggleBookmark(
  db: Db,
  studentId: number,
  lessonId: number,
  now: Date
): boolean {
  const removed = db
    .delete(bookmarks)
    .where(and(eq(bookmarks.userId, studentId), eq(bookmarks.lessonId, lessonId)))
    .returning({ id: bookmarks.id })
    .all();
  if (removed.length > 0) return false;

  // The unique index on (user, lesson) settles a race with a second request.
  db.insert(bookmarks)
    .values({ userId: studentId, lessonId, createdAt: now.toISOString() })
    .onConflictDoNothing()
    .run();
  return true;
}

export function getNote(
  db: Db,
  studentId: number,
  lessonId: number
): NoteSummary | undefined {
  return db
    .select({ body: notes.body, updatedAt: notes.updatedAt })
    .from(notes)
    .where(and(eq(notes.userId, studentId), eq(notes.lessonId, lessonId)))
    .get();
}

export type SaveNoteResult =
  | { ok: true; note: NoteSummary | null }
  | { ok: false; error: string };

/**
 * Saves the Student's Note on a Lesson, trimmed. Saving again replaces the
 * body and moves "last edited" on; `createdAt` stays put. Saving an empty box
 * clears the Note. A body over MAX_NOTE_LENGTH is refused, never truncated.
 */
export function saveNote(
  db: Db,
  studentId: number,
  lessonId: number,
  body: string,
  now: Date
): SaveNoteResult {
  const trimmed = body.trim();
  if (trimmed.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: NOTE_TOO_LONG };
  }

  if (trimmed.length === 0) {
    db.delete(notes)
      .where(and(eq(notes.userId, studentId), eq(notes.lessonId, lessonId)))
      .run();
    return { ok: true, note: null };
  }

  const when = now.toISOString();
  const note = db
    .insert(notes)
    .values({ userId: studentId, lessonId, body: trimmed, createdAt: when, updatedAt: when })
    .onConflictDoUpdate({
      target: [notes.userId, notes.lessonId],
      set: { body: trimmed, updatedAt: when },
    })
    .returning({ body: notes.body, updatedAt: notes.updatedAt })
    .get();
  return { ok: true, note };
}

/** The Lesson a saved row points at, and the Course it belongs to. */
const lessonRef = {
  lessonId: lessons.id,
  lessonTitle: lessons.title,
  moduleTitle: modules.title,
  courseTitle: courses.title,
  courseSlug: courses.slug,
};

/** The Lesson fields every row on the Saved page carries. */
export type SavedLesson = {
  lessonId: number;
  lessonTitle: string;
  moduleTitle: string;
  courseTitle: string;
  courseSlug: string;
};

/** Joins a saved row's `lessonId` to its Lesson, Module and Course, for `lessonRef`. */
function joinLessonRef<T extends SQLiteSelect>(query: T, lessonId: SQLiteColumn) {
  return query
    .innerJoin(lessons, eq(lessons.id, lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId));
}

/** The Student's Bookmarks, newest first. */
export function listBookmarks(db: Db, studentId: number) {
  const query = db
    .select({ id: bookmarks.id, createdAt: bookmarks.createdAt, ...lessonRef })
    .from(bookmarks)
    .$dynamic();
  return joinLessonRef(query, bookmarks.lessonId)
    .where(eq(bookmarks.userId, studentId))
    .orderBy(desc(bookmarks.createdAt), desc(bookmarks.id))
    .all();
}

/** The Student's Notes, last edited first. */
export function listNotes(db: Db, studentId: number) {
  const query = db
    .select({ id: notes.id, body: notes.body, updatedAt: notes.updatedAt, ...lessonRef })
    .from(notes)
    .$dynamic();
  return joinLessonRef(query, notes.lessonId)
    .where(eq(notes.userId, studentId))
    .orderBy(desc(notes.updatedAt), desc(notes.id))
    .all();
}
