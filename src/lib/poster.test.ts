import { describe, expect, it } from "vitest";
import { fitFontSize, POSTER_STYLES, posterArt, posterLines } from "./poster";

describe("poster", () => {
  it("is stable for a seed", () => {
    expect(posterArt("show-1", 600, 450)).toEqual(posterArt("show-1", 600, 450));
  });

  it("uses every style across seeds, always with shapes", () => {
    const styles = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const art = posterArt(`seed-${i}`, 1200, 600);
      styles.add(art.style);
      expect(art.shapes.length).toBeGreaterThan(0);
      for (const s of art.shapes) {
        const nums = Object.values(s).filter((v) => typeof v === "number") as number[];
        expect(nums.every(Number.isFinite)).toBe(true);
      }
    }
    expect(styles.size).toBe(POSTER_STYLES.length);
  });

  it("splits long names into two balanced lines", () => {
    expect(posterLines("Phish")).toEqual(["PHISH"]);
    expect(posterLines("King Gizzard & the Lizard Wizard")).toEqual(["KING GIZZARD &", "THE LIZARD WIZARD"]);
    expect(posterLines("Supercalifragilisticexpialidocious")).toHaveLength(1);
  });

  it("shrinks type for long lines", () => {
    expect(fitFontSize(["PHISH"], 540, 120)).toBe(120);
    expect(fitFontSize(["THE LIZARD WIZARD"], 540, 120)).toBeLessThan(60);
  });
});
