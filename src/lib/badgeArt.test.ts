import { describe, expect, it } from "vitest";
import { badgeArt, badgeNumbers, groupBadges, inkOn } from "./badgeArt";

describe("badge art", () => {
  it("groups badges in display order and keeps incoming order", () => {
    const g = groupBadges([{ key: "critic" }, { key: "century_club" }, { key: "first_show" }, { key: "brand_new" }]);
    expect(g.map((x) => x.key)).toEqual(["milestones", "social", "other"]);
    expect(g[0]!.badges.map((b) => b.key)).toEqual(["century_club", "first_show"]);
  });

  it("numbers badges by catalogue order, not earned order", () => {
    const n = badgeNumbers([{ key: "b", sort_order: 20 }, { key: "a", sort_order: 5 }]);
    expect(n.get("a")).toBe(0);
    expect(n.get("b")).toBe(1);
  });

  it("falls back to initials for unknown badges", () => {
    expect(badgeArt("x", "Night Owl", 20)).toEqual({ code: "NO", stat: "20", unit: "" });
  });

  it("picks readable ink", () => {
    expect(inkOn("#fad672")).toBe("dark");
    expect(inkOn("#404346")).toBe("light");
  });
});
