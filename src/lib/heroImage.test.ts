import { describe, expect, it } from "vitest";
import { genericConcertPhoto, heroCandidates, profileBanner, profilePhotoNumber } from "./heroImage";

describe("heroImage", () => {
  it("picks a stable bundled photo", () => {
    expect(genericConcertPhoto("abc")).toBe(genericConcertPhoto("abc"));
    expect(genericConcertPhoto("abc")).toMatch(/^\/concert\/(0[1-9]|1[0-6])\.jpg$/);
  });

  it("orders your photo, artist, venue, then the poster", () => {
    const c = heroCandidates({
      photo: "p.jpg",
      artist: { image_url: "a.jpg", image_credit: "TheAudioDB" },
      venue: { image_url: "v.jpg", image_credit: null },
    });
    expect(c.map((x) => x.kind)).toEqual(["photo", "artist", "venue", "poster"]);
  });

  it("always ends with a poster", () => {
    const c = heroCandidates({ artist: { image_url: null, image_credit: null }, venue: null });
    expect(c.map((x) => x.kind)).toEqual(["poster"]);
  });

  it("gives each user a stable header photo, and honours their pick", () => {
    expect(profilePhotoNumber("user-a")).toBe(profilePhotoNumber("user-a"));
    const picks = new Set(Array.from({ length: 40 }, (_, i) => profilePhotoNumber(`user-${i}`)));
    expect(picks.size).toBeGreaterThan(5);
    expect(profilePhotoNumber("user-a", 7)).toBe(7);
    expect(profilePhotoNumber("user-a", 99)).toBe(profilePhotoNumber("user-a"));
    expect(profileBanner("x", 3)).toBe("/concert/03.jpg");
  });
});
