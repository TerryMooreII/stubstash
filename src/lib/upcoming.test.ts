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

describe("upcoming search in the URL", async () => {
  const { emptyUpcomingFilters, hasSearchQuery, searchFromQuery, searchKey, searchToQuery } = await import("./upcoming");

  it("leaves defaults out", () => {
    expect(searchToQuery({ q: "", show: "all", filters: emptyUpcomingFilters() })).toEqual({});
    expect(hasSearchQuery({ tab: "plans" })).toBe(false);
  });

  it("round-trips a full search", () => {
    const state = {
      q: "",
      show: "seen" as const,
      filters: {
        ...emptyUpcomingFilters(),
        pick: { kind: "venue" as const, id: 45, name: "Red Rocks", place: "Morrison, CO" },
        place: { label: "Denver, CO", lat: 39.7392, lng: -104.9903 },
        range: "100" as const,
        when: "custom" as const,
        from: "2026-12-01",
        to: "2026-12-31",
      },
    };
    const query = searchToQuery(state);
    expect(hasSearchQuery(query)).toBe(true);
    expect(searchFromQuery(query)).toEqual(state);
    expect(searchKey(searchFromQuery(query))).toBe(searchKey(state));
  });

  it("keeps free text and an artist pick", () => {
    expect(searchFromQuery({ q: " phish " }).q).toBe("phish");
    const s = searchFromQuery({ artist: "12", name: "Phish", q: "ignored" });
    expect(s.filters.pick).toEqual({ kind: "artist", id: 12, name: "Phish" });
    expect(s.q).toBe("");
  });

  it("ignores bad values", () => {
    const s = searchFromQuery({ range: "7", when: "soon", show: "x", artist: "abc", name: "A", lat: "999", lng: "1", near: "X", from: "nope" });
    expect(s).toEqual({ q: "", show: "all", filters: emptyUpcomingFilters() });
    expect(searchFromQuery({ when: "month", from: "2026-12-01" }).filters.from).toBe("");
  });
});

describe("searching from an event", async () => {
  const { citySearch, defaultSearch, emptyUpcomingFilters, venueSearch } = await import("./upcoming");
  const ev = { venue_name: "Red Rocks", city: "Morrison", state: "CO", country_code: "US", lat: 39.66, lng: -105.2 };

  it("fills in the venue and its city, keeping the dates", () => {
    const base = { ...defaultSearch(), q: "jam", show: "seen" as const, filters: { ...emptyUpcomingFilters(), when: "month" as const } };
    expect(venueSearch(ev, base)).toEqual({
      q: "Red Rocks", show: "all",
      filters: { ...emptyUpcomingFilters(), when: "month", place: { label: "Morrison, CO", lat: 39.66, lng: -105.2 } },
    });
    // With SeatGeek's venue id it's a venue pick, as if chosen from the suggestions.
    expect(venueSearch(ev, base, 45)).toEqual({
      q: "", show: "all",
      filters: {
        ...emptyUpcomingFilters(), when: "month",
        pick: { kind: "venue", id: 45, name: "Red Rocks", place: "Morrison, CO" },
        place: { label: "Morrison, CO", lat: 39.66, lng: -105.2 },
      },
    });
    // No pin: just the name, where stays as it was.
    expect(venueSearch({ ...ev, lat: null }).filters.place).toBeNull();
    expect(venueSearch({ ...ev, lat: null }).q).toBe("Red Rocks");
  });

  it("searches around the city, keeping an artist but not a venue", () => {
    const artist = { kind: "artist" as const, id: 1, name: "Phish" };
    const out = citySearch(ev, { ...defaultSearch(), filters: { ...emptyUpcomingFilters(), pick: artist, range: "any" } });
    expect(out?.filters.pick).toEqual(artist);
    expect(out?.filters.place).toEqual({ label: "Morrison, CO", lat: 39.66, lng: -105.2 });
    expect(out?.filters.range).toBe("50");
    const venuePick = { kind: "venue" as const, id: 2, name: "X", place: "" };
    expect(citySearch(ev, { ...defaultSearch(), filters: { ...emptyUpcomingFilters(), pick: venuePick } })?.filters.pick).toBeNull();
    expect(citySearch({ ...ev, lat: null })).toBeNull();
  });
});

describe("matchVenue", async () => {
  const { matchVenue } = await import("./upcoming");
  const v = (id: number, name: string, city: string | null) => ({ id, name, city, state: null, upcoming: 1 });
  it("finds the same venue by name and city", () => {
    const list = [v(1, "Red Rocks Amphitheatre Lot", "Morrison"), v(2, "Red Rocks Amphitheatre", "Morrison"), v(3, "Red Rocks Amphitheatre", "Denver")];
    expect(matchVenue(list, { venue_name: "Red Rocks Amphitheatre", city: "Morrison" })?.id).toBe(2);
    expect(matchVenue(list, { venue_name: "red rocks amphitheatre!", city: null })?.id).toBe(2);
    expect(matchVenue(list, { venue_name: "Fillmore", city: "Morrison" })).toBeNull();
  });
});
