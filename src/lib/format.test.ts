import { describe, expect, it } from "vitest";
import { compact, dateParts, initials, money, ordinal, parseMoney, place, plural, stars } from "./format";
import { hash, placeholderArt } from "./color";

describe("format", () => {
  it("dateParts keeps the calendar day (no timezone shift)", () => {
    expect(dateParts("2026-09-27")).toEqual({ mon: "SEP", day: "27", yr: "2026" });
    expect(dateParts("2026-01-01")).toEqual({ mon: "JAN", day: "01", yr: "2026" });
  });

  it("ordinal", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual(
      ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st", "111th"],
    );
  });

  it("compact", () => {
    expect(compact(950)).toBe("950");
    expect(compact(9999)).toBe("9,999");
    expect(compact(18420)).toBe("18.4k");
    expect(compact(20000)).toBe("20k");
    expect(compact(null)).toBe("0");
  });

  it("stars", () => {
    expect(stars(4.5)).toBe("★★★★½");
    expect(stars(5)).toBe("★★★★★");
    expect(stars(3)).toBe("★★★☆☆");
    expect(stars(null)).toBe("☆☆☆☆☆");
  });

  it("money round-trips", () => {
    expect(money(5800, "USD")).toBe("$58.00");
    expect(money(null)).toBe("—");
    expect(parseMoney("$58")).toBe(5800);
    expect(parseMoney("58.50")).toBe(5850);
    expect(parseMoney("1,250")).toBe(125000);
    expect(parseMoney("12,50")).toBe(1250);
    expect(parseMoney("")).toBeNull();
  });

  it("place", () => {
    expect(place("Brooklyn", "NY", "US")).toBe("Brooklyn, NY");
    expect(place("London", null, "GB")).toBe("London, GB");
    expect(place(null, null, "ES")).toBe("ES");
  });

  it("plural and initials", () => {
    expect(plural(1, "show")).toBe("1 show");
    expect(plural(1204, "song")).toBe("1,204 songs");
    expect(initials("Maya Chen")).toBe("M");
    expect(initials("Maya Chen", 2)).toBe("MC");
    expect(initials("")).toBe("?");
  });
});

describe("color", () => {
  it("is stable for the same key", () => {
    expect(hash("Phish")).toBe(hash("Phish"));
    expect(placeholderArt("Phish")).toBe(placeholderArt("Phish"));
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  it("buckets", async () => {
    const { timeAgo } = await import("./format");
    expect(timeAgo("2026-10-28T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-10-28T11:55:00Z", now)).toBe("5m");
    expect(timeAgo("2026-10-28T09:00:00Z", now)).toBe("3h");
    expect(timeAgo("2026-10-26T12:00:00Z", now)).toBe("2d");
    expect(timeAgo("2026-03-04T12:00:00Z", now)).toBe("Mar 4");
    expect(timeAgo("2025-03-04T12:00:00Z", now)).toBe("Mar 4, 2025");
    expect(timeAgo(null, now)).toBe("");
  });
});

describe("timeAgo options", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  it("adds a suffix and a 'never' text", async () => {
    const { timeAgo } = await import("./format");
    expect(timeAgo("2026-10-28T11:55:00Z", { now, suffix: " ago" })).toBe("5m ago");
    expect(timeAgo("2026-10-28T11:59:30Z", { now, suffix: " ago" })).toBe("just now");
    expect(timeAgo(null, { now, never: "never" })).toBe("never");
  });
  it("keeps counting days until dateAfterDays", async () => {
    const { timeAgo } = await import("./format");
    expect(timeAgo("2026-09-28T12:00:00Z", { now, dateAfterDays: Infinity })).toBe("30d");
    expect(timeAgo("2026-09-28T12:00:00Z", { now, dateAfterDays: 60 })).toBe("30d");
    expect(timeAgo("2026-03-04T12:00:00Z", { now, dateAfterDays: 60 })).toBe("Mar 4");
    expect(timeAgo("2026-03-04T12:00:00Z", { now, dateAfterDays: 60, fullDate: true })).toBe("Mar 4, 2026");
  });
});

describe("bytes", () => {
  it("picks a unit", async () => {
    const { bytes } = await import("./format");
    expect(bytes(512)).toBe("512 B");
    expect(bytes(2048)).toBe("2.0 KB");
    expect(bytes(50 * 1024 * 1024)).toBe("50 MB");
  });
});
