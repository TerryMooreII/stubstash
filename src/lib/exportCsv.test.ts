import { describe, expect, it } from "vitest";
import { CSV_HEADER, csvCell, exportFileName, exportRows, toCsv, type ExportAttendance } from "./exportCsv";

function att(over: Partial<ExportAttendance> & { date: string; artist?: string }): ExportAttendance {
  return {
    id: over.date,
    rating: null, seat: null, price_cents: null, currency: "USD", merch: null, notes: null, is_festival: null,
    created_at: `${over.date}T23:00:00Z`,
    companions: [],
    ...over,
    show: {
      event_date: over.date, tour_name: null, info: null, is_festival: false, source: "setlistfm",
      setlistfm_url: "https://www.setlist.fm/x", artist: { name: over.artist ?? "Phish" },
      venue: { name: "Red Rocks", city: "Morrison", state_code: "CO", country_code: "US" },
    },
  };
}

describe("csv export", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(4)).toBe("4");
  });

  it("defuses spreadsheet formulas but keeps negative numbers", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("@sam")).toBe("'@sam");
    expect(csvCell("-5")).toBe("-5");
    expect(csvCell("- GA")).toBe("- GA");
  });

  it("starts with a BOM and uses CRLF", () => {
    expect(toCsv([["a", "b"], ["c", null]])).toBe("﻿a,b\r\nc,\r\n");
  });

  it("builds rows oldest first with all columns", () => {
    const rows = exportRows([
      att({ date: "2024-08-10", artist: "Goose", rating: 5, seat: "GA", price_cents: 8550, merch: "Tee",
        notes: "Great, loud", is_festival: true, companions: [{ name: "Sam" }, { name: "Alex" }] }),
      att({ date: "1997-12-31" }),
    ]);
    expect(rows[0]).toEqual(CSV_HEADER);
    expect(rows).toHaveLength(3);
    expect(rows[1]!.slice(0, 3)).toEqual([1, "1997-12-31", "Phish"]);
    expect(rows[1]![14]).toBeNull(); // no price -> no currency either
    expect(rows[1]![15]).toBeNull();
    const g = rows[2]!;
    expect(g.length).toBe(CSV_HEADER.length);
    expect(g[0]).toBe(2);
    expect(g[9]).toBe("yes");
    expect(g[10]).toBe("setlist.fm");
    expect(g[12]).toBe(5);
    expect(g[14]).toBe("85.50");
    expect(g[15]).toBe("USD");
    expect(g[18]).toBe("Sam; Alex");
  });

  it("names the file with handle and date", () => {
    expect(exportFileName("terry", new Date(2026, 9, 28, 12))).toBe("stubstash-terry-2026-10-28.csv");
  });
});
