import { describe, expect, it } from "vitest";
import { milesBetween } from "./geo";

describe("milesBetween", () => {
  it("is zero for the same point", () => {
    expect(milesBetween(40, -74, 40, -74)).toBe(0);
  });
  it("matches a known distance (NYC to LA is about 2,450 mi)", () => {
    expect(Math.round(milesBetween(40.7128, -74.006, 34.0522, -118.2437) / 10) * 10).toBe(2450);
  });
});
