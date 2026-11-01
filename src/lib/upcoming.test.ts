import { describe, expect, it } from "vitest";
import { countdown, crewSummary, daysUntil, logQuery, nextDays, priceFrom, showTime, weekendRange } from "./upcoming";

const NOW = new Date(2026, 10, 1, 15); // Sun Nov 1 2026, 3pm local

describe("upcoming", () => {
  it("daysUntil counts calendar days", () => {
    expect(daysUntil("2026-11-01", NOW)).toBe(0);
    expect(daysUntil("2026-11-02", NOW)).toBe(1);
    expect(daysUntil("2026-12-01", NOW)).toBe(30);
    expect(daysUntil("2026-10-31", NOW)).toBe(-1);
  });

  it("countdown", () => {
    expect(countdown("2026-11-01", NOW)).toBe("TONIGHT");
    expect(countdown("2026-11-02", NOW)).toBe("TOMORROW");
    expect(countdown("2026-11-13", NOW)).toBe("IN 12 DAYS");
    expect(countdown("2026-10-31", NOW)).toBe("LAST NIGHT");
    expect(countdown("2026-10-01", NOW)).toBe("PAST");
  });

  it("showTime", () => {
    expect(showTime("19:30:00")).toBe("7:30 PM");
    expect(showTime("00:05:00")).toBe("12:05 AM");
    expect(showTime("12:00:00")).toBe("12:00 PM");
    expect(showTime(null)).toBe("");
  });

  it("priceFrom", () => {
    expect(priceFrom({ lowest_price: 44.6 })).toBe("from $45");
    expect(priceFrom({ lowest_price: null })).toBe("");
  });

  it("crewSummary", () => {
    expect(crewSummary([])).toBe("Just you so far");
    expect(crewSummary([
      { display_name: "Maya Chen", handle: "maya", status: "going" },
      { display_name: "", handle: "dev", status: "going" },
      { display_name: "Priya", handle: "priya", status: "interested" },
      { display_name: "Sam", handle: "sam", status: "invited" },
    ])).toBe("Maya & dev going · 1 interested · 1 invited");
    expect(crewSummary([
      { display_name: "A", handle: "a", status: "going" },
      { display_name: "B", handle: "b", status: "going" },
      { display_name: "C", handle: "c", status: "going" },
    ])).toBe("A & B +1 going");
  });

  it("weekendRange", () => {
    expect(weekendRange(new Date(2026, 10, 4))).toEqual({ from: "2026-11-06", to: "2026-11-08" }); // Wed
    expect(weekendRange(new Date(2026, 10, 7))).toEqual({ from: "2026-11-07", to: "2026-11-08" }); // Sat
    expect(weekendRange(NOW)).toEqual({ from: "2026-11-01", to: "2026-11-01" }); // Sun
  });

  it("nextDays", () => {
    expect(nextDays(30, NOW)).toEqual({ from: "2026-11-01", to: "2026-12-01" });
  });

  it("logQuery", () => {
    expect(logQuery({ artist: "Phish", local_date: "2026-12-31", city: "New York" }))
      .toEqual({ find: "1", artist: "Phish", date: "2026-12-31", city: "New York" });
  });
});

describe("upcoming search params", async () => {
  const { emptyUpcomingFilters, filtersActive, searchParams } = await import("./upcoming");

  it("defaults to 50 miles around home", () => {
    expect(searchParams("", "all", emptyUpcomingFilters(), NOW)).toEqual({ range: "50" });
    expect(filtersActive(emptyUpcomingFilters())).toBe(false);
  });

  it("combines the box, quick filter and advanced filters", () => {
    const f = { ...emptyUpcomingFilters(), venue: "Red Rocks", range: "100" as const, place: { label: "Denver", lat: 39.7, lng: -105 } };
    expect(filtersActive(f)).toBe(true);
    expect(searchParams(" phish ", "month", f, NOW)).toEqual({
      range: "100", q: "phish", venue: "Red Rocks", lat: 39.7, lng: -105, place_label: "Denver",
      from: "2026-11-01", to: "2026-12-01",
    });
    expect(searchParams("", "seen", emptyUpcomingFilters(), NOW)).toEqual({ range: "50", seen_only: true });
  });
});
