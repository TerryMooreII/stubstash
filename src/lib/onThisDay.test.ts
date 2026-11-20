import { describe, expect, it } from "vitest";
import { onThisDay, yearsAgoLabel } from "./onThisDay";
import type { ShowGroup } from "./shows";

const show = (event_date: string) => ({ key: event_date, event_date }) as ShowGroup;
const now = new Date(2026, 10, 19, 9); // Nov 19, 2026

describe("onThisDay", () => {
  it("finds shows on the same month and day in earlier years, most recent first", () => {
    const out = onThisDay([show("2019-11-19"), show("2025-11-19"), show("2025-11-18"), show("2024-10-19")], now);
    expect(out.map((a) => [a.show.event_date, a.years])).toEqual([["2025-11-19", 1], ["2019-11-19", 7]]);
  });

  it("leaves out a show from today", () => {
    expect(onThisDay([show("2026-11-19")], now)).toEqual([]);
  });

  it("labels the years", () => {
    expect(yearsAgoLabel(1)).toBe("1 YEAR AGO TODAY");
    expect(yearsAgoLabel(12)).toBe("12 YEARS AGO TODAY");
  });
});
