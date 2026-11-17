import { describe, expect, it } from "vitest";
import { groupByDay, relativeTime } from "./feed-view";

const NOW = new Date("2026-11-18T12:00:00Z");

function minutesBefore(minutes: number) {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

describe("relativeTime", () => {
  it.each([
    [0, "just now"],
    [0.5, "just now"],
    [1, "1m ago"],
    [59, "59m ago"],
    [60, "1h ago"],
    [60 * 23 + 59, "23h ago"],
    [60 * 24, "1d ago"],
    [60 * 24 * 6, "6d ago"],
  ])("reads %s minutes ago as %s", (minutes, expected) => {
    expect(relativeTime(minutesBefore(minutes), NOW)).toBe(expected);
  });

  it("treats a time slightly in the future as just now", () => {
    expect(relativeTime("2026-11-18T12:00:05Z", NOW)).toBe("just now");
  });
});

describe("groupByDay", () => {
  const item = (id: string, minutes: number) => ({
    id,
    insertedAt: minutesBefore(minutes),
  });

  it("puts the last 24 hours under Today and the rest under Earlier, keeping the order", () => {
    const items = [
      item("a", 5),
      item("b", 60 * 23),
      item("c", 60 * 24),
      item("d", 60 * 24 * 3),
    ];

    expect(groupByDay(items, NOW)).toEqual([
      { label: "Today", items: [items[0], items[1]] },
      { label: "Earlier", items: [items[2], items[3]] },
    ]);
  });

  it("leaves out a group with nothing in it", () => {
    expect(groupByDay([item("a", 60 * 48)], NOW)).toEqual([
      { label: "Earlier", items: [item("a", 60 * 48)] },
    ]);
    expect(groupByDay([], NOW)).toEqual([]);
  });
});
