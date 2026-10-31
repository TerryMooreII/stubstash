import { describe, expect, it } from "vitest";
import { diffPatch } from "./patch";

describe("diffPatch", () => {
  const row = { name: "Phish", genre: null, capacity: 2500 };
  it("keeps only changed, trimmed fields", () => {
    expect(diffPatch({ name: " Phish ", genre: "", capacity: "2500" }, row)).toEqual({});
    expect(diffPatch({ name: "Phish", genre: " Jam ", capacity: "3000" }, row)).toEqual({ genre: "Jam", capacity: "3000" });
  });
  it("lets fields be cleared", () => {
    expect(diffPatch({ name: "Phish", genre: "", capacity: "" }, row)).toEqual({ capacity: "" });
  });
  it("skips empty required fields", () => {
    expect(diffPatch({ name: "  ", genre: "", capacity: "2500" }, row, { required: ["name"] })).toEqual({});
  });
});
