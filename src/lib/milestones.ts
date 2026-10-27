// Show-count milestones used for "N to the Century Club" style headlines.

export const MILESTONES = [
  { n: 10, name: "Double Digits" },
  { n: 25, name: "Quarter Century" },
  { n: 50, name: "Half Century" },
  { n: 100, name: "Century Club" },
  { n: 250, name: "250 Club" },
  { n: 500, name: "500 Club" },
  { n: 1000, name: "Thousand Club" },
] as const;

export interface Milestone {
  target: number;
  name: string;
  remaining: number;
  /** The previous milestone (0 at the start), for progress bars. */
  from: number;
}

/** Next milestone strictly above n. Past 1000, counts up in steps of 500. */
export function nextMilestone(n: number): Milestone {
  const shows = Math.max(0, Math.floor(n));
  let from = 0;
  for (const m of MILESTONES) {
    if (shows < m.n) return { target: m.n, name: m.name, remaining: m.n - shows, from };
    from = m.n;
  }
  const target = (Math.floor(shows / 500) + 1) * 500;
  return { target, name: `${target.toLocaleString("en-US")} Club`, remaining: target - shows, from: target - 500 };
}
