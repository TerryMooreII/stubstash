import { describe as group, expect, it } from "vitest";
import { describe, emptyFilters, fromQuery, hasWhere, toParams, toQuery } from "./advancedSearch";

group("advancedSearch", () => {
  it("needs more than a year", () => {
    expect(hasWhere({ ...emptyFilters(), year: "1997" })).toBe(false);
    expect(hasWhere({ ...emptyFilters(), year: "1997", country: "US" })).toBe(true);
  });

  it("exact date beats year, exact artist beats name", () => {
    const p = toParams({ ...emptyFilters(), artist: "Phish", artist_mbid: "e01646f2-2a04-450d-8bf2-0d993082e058", year: "1997", date: "1997-08-17" });
    expect(p).toEqual({ artist_mbid: "e01646f2-2a04-450d-8bf2-0d993082e058", date: "1997-08-17" });
  });

  it("round-trips through the URL", () => {
    const f = { ...emptyFilters(), artist: "Phish", venue: "Red Rocks", year: "1996" };
    const q = toQuery(f);
    expect(q).toEqual({ find: "1", artist: "Phish", venue: "Red Rocks", year: "1996" });
    expect(fromQuery(q)).toEqual(f);
  });

  it("describes the filters", () => {
    expect(describe({ ...emptyFilters(), artist: "Phish", year: "1997", venue: "Red Rocks", state: "CO" })).toBe("Phish · 1997 · Red Rocks, CO");
  });
});
