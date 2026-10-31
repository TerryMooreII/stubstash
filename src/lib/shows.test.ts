import { describe, expect, it } from "vitest";
import { entryTicketProps, festivalCount, groupShows, suggestFestivals, ticketProps } from "./shows";
import type { LogEntry } from "./types";

let n = 0;
function e(over: Partial<LogEntry>): LogEntry {
  n++;
  return {
    attendance_id: `a${n}`, show_id: `s${n}`, show_number: 1, event_date: "2024-07-31", artist_id: `ar${n}`,
    artist_name: `Artist ${n}`, artist_image: null, venue_id: "v1", venue_name: "Walnut Creek", city: "Raleigh",
    state_code: "NC", country_code: "US", lat: null, lng: null, tour_name: null, is_festival: false, source: "setlistfm",
    setlistfm_id: null, rating: null, song_count: 10, has_stub: false, photo_count: 0,
    created_at: `2024-08-01T00:00:0${n % 10}Z`, festival_name: null, headliner: null,
    ...over,
  };
}

describe("groupShows", () => {
  it("puts acts at one venue on one date on one ticket, headliner first", () => {
    const g = groupShows([
      e({ artist_name: "Steve Winwood", song_count: 10 }),
      e({ artist_name: "The Doobie Brothers", song_count: 20 }),
      e({ artist_name: "Phish", event_date: "2024-08-02", venue_id: "v2", show_number: 2 }),
    ]);
    expect(g).toHaveLength(2);
    expect(g[0]!.acts.map((a) => a.artist_name)).toEqual(["Phish"]);
    expect(g[1]!.acts.map((a) => a.artist_name)).toEqual(["The Doobie Brothers", "Steve Winwood"]);
    expect(g[1]!.song_count).toBe(30);
  });

  it("lets a picked headliner win over song count", () => {
    const g = groupShows([e({ artist_name: "Opener", song_count: 11 }), e({ artist_name: "Railroad Earth", song_count: 7, headliner: true })]);
    expect(g[0]!.acts[0]!.artist_name).toBe("Railroad Earth");
  });

  it("keeps same-date shows at different venues apart", () => {
    expect(groupShows([e({ venue_id: "v1" }), e({ venue_id: "v9", venue_name: "Red Rocks" })])).toHaveLength(2);
  });

  it("groups duplicate records of the same venue by name", () => {
    expect(groupShows([e({ venue_id: "v1", venue_name: "RamKat" }), e({ venue_id: "v2", venue_name: "ramkat " })])).toHaveLength(1);
  });
});

describe("festivals", () => {
  it("counts festivals by name, or venue and year when unnamed", () => {
    expect(festivalCount([
      e({ is_festival: true, festival_name: "Lockn'" }),
      e({ is_festival: true, festival_name: "lockn'", event_date: "2024-08-01" }),
      e({ is_festival: true, venue_id: "v7" }),
      e({ is_festival: false }),
    ])).toBe(2);
  });

  it("suggests back-to-back days at one venue with several artists", () => {
    const s = suggestFestivals([
      e({ event_date: "2018-08-23", venue_id: "farm", venue_name: "Infinity Downs Farm" }),
      e({ event_date: "2018-08-23", venue_id: "farm", venue_name: "Infinity Downs Farm" }),
      e({ event_date: "2018-08-24", venue_id: "farm", venue_name: "Infinity Downs Farm" }),
      e({ event_date: "2018-08-26", venue_id: "farm", venue_name: "Infinity Downs Farm" }), // gap breaks the run
      e({ event_date: "2024-07-31", venue_id: "v1" }),
      e({ event_date: "2024-07-31", venue_id: "v1" }),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ venue_name: "Infinity Downs Farm", days: 2, artists: 3, from: "2018-08-23", to: "2018-08-24" });
    expect(s[0]!.attendanceIds).toHaveLength(3);
  });

  it("doesn't suggest what's already marked", () => {
    const s = suggestFestivals([
      e({ event_date: "2018-08-23", venue_id: "f", is_festival: true }),
      e({ event_date: "2018-08-24", venue_id: "f", is_festival: true }),
      e({ event_date: "2018-08-24", venue_id: "f", is_festival: true }),
    ]);
    expect(s).toHaveLength(0);
  });
});

describe("ticketProps", () => {
  it("maps a show to ticket props with openers linking to their own pages", () => {
    const [g] = groupShows([
      e({ attendance_id: "h", artist_name: "Head", song_count: 20 }),
      e({ attendance_id: "o", artist_name: "Opener", song_count: 5 }),
    ]);
    const p = ticketProps(g!, "/u/sam/shows");
    expect(p.to).toBe("/u/sam/shows/h");
    expect(p.artist).toBe("Head");
    expect(p.openers).toEqual([{ name: "Opener", to: "/u/sam/shows/o" }]);
    expect(p.place).toBe("Raleigh, NC");
    expect(p.festival).toBeNull();
    expect(p.songs).toBe(25);
  });

  it("marks festivals with their name, or true when unnamed", () => {
    expect(ticketProps(groupShows([e({ is_festival: true, festival_name: "Bonnaroo" })])[0]!).festival).toBe("Bonnaroo");
    expect(ticketProps(groupShows([e({ is_festival: true })])[0]!).festival).toBe(true);
  });

  it("maps a single entry", () => {
    const p = entryTicketProps(e({ attendance_id: "x", city: "London", country_code: "GB" }));
    expect(p.to).toBe("/app/shows/x");
    expect(p.place).toBe("London, GB");
  });
});
