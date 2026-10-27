import { describe, expect, it } from "vitest";
import { nextMilestone } from "./milestones";

describe("nextMilestone", () => {
  it("starts at 10", () => {
    expect(nextMilestone(0)).toMatchObject({ target: 10, remaining: 10, from: 0 });
  });
  it("finds the Century Club from 87", () => {
    expect(nextMilestone(87)).toMatchObject({ target: 100, name: "Century Club", remaining: 13, from: 50 });
  });
  it("moves past an exact milestone", () => {
    expect(nextMilestone(100)).toMatchObject({ target: 250, from: 100 });
  });
  it("counts in 500s past 1000", () => {
    expect(nextMilestone(1000)).toMatchObject({ target: 1500, from: 1000, remaining: 500 });
    expect(nextMilestone(1720)).toMatchObject({ target: 2000, remaining: 280 });
  });
});
