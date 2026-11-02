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
  const { emptyUpcomingFilters, searchParams, whenLabel, whereLabel, whereParams, whereShort } = await import("./upcoming");
  const denver = { label: "Denver, CO", lat: 39.7, lng: -105 };

  it("defaults to 50 miles around home, 6 months out", () => {
    expect(searchParams("", "all", emptyUpcomingFilters(), NOW)).toEqual({ range: "50" });
    expect(whereLabel(emptyUpcomingFilters(), "Columbus, OH")).toBe("Within 50 mi of Columbus, OH");
    expect(whereShort(emptyUpcomingFilters(), "Columbus, OH")).toBe("Columbus · 50 mi");
    expect(whereLabel(emptyUpcomingFilters(), null)).toBe("Anywhere");
    expect(whenLabel(emptyUpcomingFilters())).toBe("Next 6 months");
  });

  it("free text searches around the picked city", () => {
    const f = { ...emptyUpcomingFilters(), place: denver, range: "100" as const, when: "month" as const };
    expect(searchParams(" phish ", "all", f, NOW)).toEqual({
      range: "100", q: "phish", lat: 39.7, lng: -105, place_label: "Denver, CO", from: "2026-11-01", to: "2026-12-01",
    });
    expect(whereLabel(f, "Columbus, OH")).toBe("Within 100 mi of Denver, CO");
  });

  it("a picked artist searches by id, and ignores the box text", () => {
    const f = { ...emptyUpcomingFilters(), pick: { kind: "artist" as const, id: 7, name: "Phish" } };
    expect(searchParams("Phish", "all", f, NOW)).toEqual({ range: "50", performer_id: 7 });
  });

  it("a picked venue searches by id, without a distance", () => {
    const f = { ...emptyUpcomingFilters(), place: denver, pick: { kind: "venue" as const, id: 9, name: "Red Rocks", place: "Morrison, CO" } };
    expect(searchParams("", "all", f, NOW)).toEqual({ range: "50", venue_id: 9 });
    expect(whereLabel(f, "Columbus, OH")).toBe("At Red Rocks");
  });

  it("artists you've seen ignores the box and the pick", () => {
    const f = { ...emptyUpcomingFilters(), pick: { kind: "artist" as const, id: 7, name: "Phish" } };
    expect(searchParams("x", "seen", f, NOW)).toEqual({ range: "50", seen_only: true });
  });

  it("where params for venue suggestions", () => {
    expect(whereParams(emptyUpcomingFilters())).toEqual({ range: "50" });
    expect(whereParams({ ...emptyUpcomingFilters(), place: denver, range: "25" }))
      .toEqual({ range: "25", lat: 39.7, lng: -105, place_label: "Denver, CO" });
  });

  it("custom dates", () => {
    const f = { ...emptyUpcomingFilters(), when: "custom" as const, from: "2026-11-03", to: "2026-12-01" };
    expect(searchParams("", "all", f, NOW)).toEqual({ range: "50", from: "2026-11-03", to: "2026-12-01" });
    expect(whenLabel(f)).toBe("Nov 3 – Dec 1");
    expect(whenLabel({ ...f, to: "" })).toBe("From Nov 3");
    expect(whenLabel({ ...f, from: "", to: "" })).toBe("Next 6 months");
  });
});
