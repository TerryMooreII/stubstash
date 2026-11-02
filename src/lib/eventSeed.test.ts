import { describe, expect, it } from "vitest";
import { mergeFresh, rememberEvent, seededEvent } from "./eventSeed";
import type { PlanItem } from "./types";

const item = (id: number, event: Record<string, unknown> = {}, rest: Partial<PlanItem> = {}) =>
  ({ event: { seatgeek_id: id, image_url: null, image_credit: null, venue_image_url: null, venue_image_credit: null, ...event }, status: null, crew: [], ...rest }) as unknown as PlanItem;

describe("eventSeed", () => {
  it("remembers events by SeatGeek id", () => {
    expect(seededEvent(1)).toBeNull();
    rememberEvent(item(1, { image_url: "a.jpg" }));
    expect(seededEvent(1)?.event.image_url).toBe("a.jpg");
  });

  it("keeps photos the server doesn't have yet", () => {
    const seed = item(2, { image_url: "a.jpg", image_credit: "Deezer" }, { seen: 3 });
    const fresh = item(2, { venue_image_url: "v.jpg" }, { status: "going" });
    const out = mergeFresh(fresh, seed);
    expect(out.event.image_url).toBe("a.jpg");
    expect(out.event.venue_image_url).toBe("v.jpg");
    expect(out.status).toBe("going");
    expect(out.seen).toBe(3);
  });

  it("prefers the server's photo", () => {
    const out = mergeFresh(item(3, { image_url: "new.jpg" }), item(3, { image_url: "old.jpg" }));
    expect(out.event.image_url).toBe("new.jpg");
  });
});
