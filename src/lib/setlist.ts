// Pure helpers for the setlist editor. Every function returns a new array
// (no mutation) so they work directly with v-model and are easy to test.

import type { SetDraft, SetlistSong } from "./types";

export function emptySets(): SetDraft[] {
  return [{ name: "Set", encore: false, songs: [] }];
}

function clone(sets: SetDraft[]): SetDraft[] {
  return sets.map((s) => ({ ...s, songs: [...s.songs] }));
}

/** Total songs across all sets. */
export function totalSongs(sets: SetDraft[]): number {
  return sets.reduce((n, s) => n + s.songs.length, 0);
}

/** Adds a song (trimmed, max 300 chars) to the end of a set. Blank titles are ignored. */
export function addSong(sets: SetDraft[], setIdx: number, title: string): SetDraft[] {
  const t = title.trim().slice(0, 300);
  if (!t || !sets[setIdx]) return sets;
  const next = clone(sets);
  next[setIdx]!.songs.push(t);
  return next;
}

export function removeSong(sets: SetDraft[], setIdx: number, songIdx: number): SetDraft[] {
  const set = sets[setIdx];
  if (!set || songIdx < 0 || songIdx >= set.songs.length) return sets;
  const next = clone(sets);
  next[setIdx]!.songs.splice(songIdx, 1);
  return next;
}

/**
 * Moves a song up (-1) or down (+1). At the edge of a set it hops into the
 * neighbouring set (end of the previous one / start of the next one).
 */
export function moveSong(sets: SetDraft[], setIdx: number, songIdx: number, dir: -1 | 1): SetDraft[] {
  const set = sets[setIdx];
  if (!set || songIdx < 0 || songIdx >= set.songs.length) return sets;
  const next = clone(sets);
  const songs = next[setIdx]!.songs;
  const target = songIdx + dir;
  if (target >= 0 && target < songs.length) {
    [songs[songIdx], songs[target]] = [songs[target]!, songs[songIdx]!];
    return next;
  }
  const neighbour = next[setIdx + dir];
  if (!neighbour) return sets;
  const [song] = songs.splice(songIdx, 1);
  if (dir === -1) neighbour.songs.push(song!);
  else neighbour.songs.unshift(song!);
  return next;
}

/** True when a song can move in that direction. */
export function canMove(sets: SetDraft[], setIdx: number, songIdx: number, dir: -1 | 1): boolean {
  const set = sets[setIdx];
  if (!set) return false;
  const target = songIdx + dir;
  if (target >= 0 && target < set.songs.length) return true;
  return !!sets[setIdx + dir];
}

/** Renames regular sets "Set" / "Set 1, Set 2…" and encores "Encore" / "Encore 2…". */
export function renumber(sets: SetDraft[]): SetDraft[] {
  const regular = sets.filter((s) => !s.encore).length;
  const encores = sets.filter((s) => s.encore).length;
  let r = 0, e = 0;
  return sets.map((s) => {
    if (s.encore) {
      e++;
      return { ...s, name: encores > 1 ? `Encore ${e}` : "Encore" };
    }
    r++;
    return { ...s, name: regular > 1 ? `Set ${r}` : "Set" };
  });
}

/** Adds a regular set (before any encores) or an encore (at the end). */
export function addSet(sets: SetDraft[], encore: boolean): SetDraft[] {
  const next = clone(sets);
  const fresh: SetDraft = { name: "", encore, songs: [] };
  if (encore) next.push(fresh);
  else {
    const firstEncore = next.findIndex((s) => s.encore);
    next.splice(firstEncore === -1 ? next.length : firstEncore, 0, fresh);
  }
  return renumber(next);
}

/** Removes a set (and its songs). Always keeps at least one set. */
export function removeSet(sets: SetDraft[], setIdx: number): SetDraft[] {
  if (sets.length <= 1 || !sets[setIdx]) return sets;
  return renumber(clone(sets).filter((_, i) => i !== setIdx));
}

/** Trimmed sets with empty songs/sets dropped, ready for the API. */
export function cleanSets(sets: SetDraft[]): SetDraft[] {
  return sets
    .map((s) => ({ name: s.name.trim() || (s.encore ? "Encore" : "Set"), encore: s.encore, songs: s.songs.map((x) => x.trim()).filter(Boolean) }))
    .filter((s) => s.songs.length > 0);
}

/** Builds editor sets from a show's saved setlist (rows from show_setlist). */
export function fromSetlist(rows: Pick<SetlistSong, "set_index" | "set_name" | "is_encore" | "position" | "name">[]): SetDraft[] {
  if (!rows.length) return emptySets();
  const byIndex = new Map<number, SetDraft>();
  for (const r of [...rows].sort((a, b) => a.position - b.position)) {
    let set = byIndex.get(r.set_index);
    if (!set) {
      set = { name: r.set_name, encore: r.is_encore, songs: [] };
      byIndex.set(r.set_index, set);
    }
    set.songs.push(r.name);
  }
  return [...byIndex.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => s);
}

/** Running song number (1-based, across sets) for display: "01", "02"… */
export function songNumber(sets: SetDraft[], setIdx: number, songIdx: number): string {
  let n = 0;
  for (let i = 0; i < setIdx; i++) n += sets[i]?.songs.length ?? 0;
  return String(n + songIdx + 1).padStart(2, "0");
}
