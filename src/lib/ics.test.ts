import { describe, expect, it } from "vitest";
import { eventIcs, icsFileName, icsText } from "./ics";

const base = {
  seatgeek_id: 42,
  artist: "Billy Strings",
  performers: ["Billy Strings", "Molly Tuttle"],
  venue_name: "Red Rocks; Amphitheatre",
  city: "Morrison",
  state: "CO",
  country_code: "US",
  starts_at: "2026-12-31T02:30:00Z",
  local_date: "2026-12-30",
  local_time: "19:30:00",
  ticket_url: "https://seatgeek.com/e/42",
};
const now = new Date("2026-11-19T12:00:00Z");

describe("eventIcs", () => {
  it("writes a timed event in UTC, three hours long", () => {
    const ics = eventIcs(base, "https://stubstash.live/app/upcoming/42", now);
    expect(ics).toContain("DTSTART:20261231T023000Z\r\n");
    expect(ics).toContain("DTEND:20261231T053000Z\r\n");
    expect(ics).toContain("UID:seatgeek-42@stubstash\r\n");
    expect(ics).toContain("SUMMARY:Billy Strings at Red Rocks\; Amphitheatre\r\n");
    expect(ics).toContain("LOCATION:Red Rocks\; Amphitheatre\\, Morrison\\, CO\r\n");
    expect(ics).toContain("With Molly Tuttle\\nTickets: https://seatgeek.com/e/42");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("writes an all-day event when there's no start time", () => {
    const ics = eventIcs({ ...base, starts_at: null, local_time: null }, "https://x.test/e", now);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261230\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261231\r\n");
  });

  it("folds long lines at 75 bytes", () => {
    const ics = eventIcs({ ...base, performers: ["Billy Strings", "A".repeat(200)] }, "https://x.test/e", now);
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(ics.replace(/\r\n /g, "")).toContain("A".repeat(200));
  });
});

describe("icsText / icsFileName", () => {
  it("escapes commas, semicolons, backslashes and newlines", () => {
    expect(icsText("a,b;c\\d\ne")).toBe("a\\,b\;c\\\\d\\ne");
  });
  it("names the file after the artist and date", () => {
    expect(icsFileName({ artist: "AC/DC & Friends", local_date: "2026-12-30" })).toBe("ac-dc-friends-2026-12-30.ics");
  });
});
