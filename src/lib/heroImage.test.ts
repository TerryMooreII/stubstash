import { describe, expect, it } from "vitest";
import { genericConcertPhoto, heroCandidates } from "./heroImage";

describe("heroImage", () => {
  it("picks a stable bundled photo", () => {
    expect(genericConcertPhoto("abc")).toBe(genericConcertPhoto("abc"));
    expect(genericConcertPhoto("abc")).toMatch(/^\/concert\/(0[1-9]|1[0-6])\.jpg$/);
  });

  it("orders your photo, artist, venue, then generic", () => {
    const c = heroCandidates({
      seed: "s",
      photo: "p.jpg",
      artist: { image_url: "a.jpg", image_credit: "TheAudioDB" },
      venue: { image_url: "v.jpg", image_credit: null },
    });
    expect(c.map((x) => x.kind)).toEqual(["photo", "artist", "venue", "generic"]);
  });

  it("always ends with a generic photo", () => {
    const c = heroCandidates({ seed: "s", artist: { image_url: null, image_credit: null }, venue: null });
    expect(c.map((x) => x.kind)).toEqual(["generic"]);
  });
});
