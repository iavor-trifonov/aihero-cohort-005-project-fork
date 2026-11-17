import { describe, expect, it } from "vitest";
import { unreadBadgeLabel } from "./badge";

describe("unreadBadgeLabel", () => {
  it("shows no badge at 0 unread", () => {
    expect(unreadBadgeLabel(0)).toBeNull();
  });

  it("shows 1 to 9 exactly", () => {
    expect(unreadBadgeLabel(1)).toBe("1");
    expect(unreadBadgeLabel(9)).toBe("9");
  });

  it('shows "9+" above nine', () => {
    expect(unreadBadgeLabel(10)).toBe("9+");
    expect(unreadBadgeLabel(250)).toBe("9+");
  });
});
