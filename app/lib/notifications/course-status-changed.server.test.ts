import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { fileFeed } from "./feed.server";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { CourseStatus, UserRole } from "~/db/schema";
import { buildCourseStatusChanged } from "./course-status-changed.server";
import { renderNotification } from "./render";
import type { Notification } from "./notification";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let pat: typeof schema.users.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  pat = db
    .insert(schema.users)
    .values({ name: "Pat Admin", email: "pat@example.com", role: UserRole.Admin })
    .returning()
    .get();
});

/** What the /admin/courses action does: the update commits first. */
function changeStatus(status: CourseStatus) {
  const previous = db
    .select({ status: schema.courses.status })
    .from(schema.courses)
    .where(eq(schema.courses.id, base.course.id))
    .get()!.status;
  db.update(schema.courses)
    .set({ status })
    .where(eq(schema.courses.id, base.course.id))
    .run();
  return previous;
}

/** The rendered text, with bold parts wrapped in `**`. */
function textOf(notification: Notification) {
  return renderNotification(notification)
    .parts.map((part) => (part.bold ? `**${part.text}**` : part.text))
    .join("");
}

describe("course-status-changed", () => {
  it("goes to the course's Instructor, from the admin, linking to the course editor", () => {
    const previous = changeStatus(CourseStatus.Archived);

    const notification = buildCourseStatusChanged(
      db,
      base.course.id,
      previous,
      pat.id
    );

    expect(notification).toEqual({
      type: "course-status-changed",
      recipients: [{ id: String(base.instructor.id), name: "Test Instructor" }],
      actorId: String(pat.id),
      data: {
        courseTitle: "Test Course",
        status: "archived",
        url: `/instructor/${base.course.id}`,
      },
    });
  });

  it.each([
    [CourseStatus.Draft, CourseStatus.Published, "**Test Course** was published."],
    [CourseStatus.Published, CourseStatus.Archived, "**Test Course** was archived."],
    [CourseStatus.Published, CourseStatus.Draft, "**Test Course** was moved back to draft."],
  ])("from %s to %s reads %j", (from, to, text) => {
    changeStatus(from);
    const previous = changeStatus(to);

    const notification = buildCourseStatusChanged(
      db,
      base.course.id,
      previous,
      pat.id
    );

    if (!notification) throw new Error("Expected a Notification");
    expect(notification.data).toMatchObject({ status: to });
    expect(textOf(notification)).toBe(text);
  });

  it("is nothing when the status didn't change", () => {
    const previous = changeStatus(CourseStatus.Published);

    expect(
      buildCourseStatusChanged(db, base.course.id, previous, pat.id)
    ).toBeNull();
  });

  it("notifies nobody when an admin changes their own course's status", async () => {
    db.update(schema.users)
      .set({ role: UserRole.Admin })
      .where(eq(schema.users.id, base.instructor.id))
      .run();
    const previous = changeStatus(CourseStatus.Archived);
    const feed = fileFeed(
      join(mkdtempSync(join(tmpdir(), "feed-")), "notifications.json")
    );

    const notification = buildCourseStatusChanged(
      db,
      base.course.id,
      previous,
      base.instructor.id
    );
    if (!notification) throw new Error("Expected a Notification");
    await feed.notify(notification);

    expect(
      await feed.list(String(base.instructor.id), { status: "all" })
    ).toEqual([]);
  });

  it("is nothing for a course that doesn't exist", () => {
    expect(
      buildCourseStatusChanged(db, 9999, CourseStatus.Draft, pat.id)
    ).toBeNull();
  });
});
