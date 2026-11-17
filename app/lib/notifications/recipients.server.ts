import { asc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { UserRole, users } from "~/db/schema";
import { userKey, type Recipient } from "./notification";

// ─── Recipient lookups ───
// Shared by the builders. Each runs at trigger time, so whoever holds the role
// right then gets the Notification (e.g. a newly promoted Platform Admin).

export type Db = BetterSQLite3Database<typeof schema>;

export function toRecipient(user: { id: number; name: string }): Recipient {
  return { id: userKey(user.id), name: user.name };
}

/** Every Platform Admin. */
export function getPlatformAdmins(db: Db): Recipient[] {
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.role, UserRole.Admin))
    .orderBy(asc(users.id))
    .all()
    .map(toRecipient);
}
