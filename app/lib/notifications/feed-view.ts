// ─── How the /notifications page arranges a feed ───
// Pure helpers shared by the server render and the browser. Each takes `now`
// explicitly (the loader passes its own), so both renders agree.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5m ago", "3h ago", "2d ago". */
export function relativeTime(insertedAt: string, now: Date): string {
  const elapsed = now.getTime() - new Date(insertedAt).getTime();
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  return `${Math.floor(elapsed / DAY)}d ago`;
}

export type DayGroup<T> = { label: "Today" | "Earlier"; items: T[] };

/**
 * Splits a newest-first feed into Today (the last 24 hours) and Earlier,
 * keeping the order and leaving out an empty group.
 */
export function groupByDay<T extends { insertedAt: string }>(
  items: T[],
  now: Date
): DayGroup<T>[] {
  const isToday = (item: T) =>
    now.getTime() - new Date(item.insertedAt).getTime() < DAY;

  const groups: DayGroup<T>[] = [
    { label: "Today", items: items.filter(isToday) },
    { label: "Earlier", items: items.filter((item) => !isToday(item)) },
  ];
  return groups.filter((group) => group.items.length > 0);
}
