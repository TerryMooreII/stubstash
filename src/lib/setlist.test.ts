import { describe, expect, it } from "vitest";
import {
  addSet, addSong, canMove, cleanSets, emptySets, fromSetlist, moveSong, removeSet, removeSong, songNumber, totalSongs,
} from "./setlist";
import type { SetDraft } from "./types";

const two = (): SetDraft[] => [
  { name: "Set 1", encore: false, songs: ["A", "B"] },
  { name: "Set 2", encore: false, songs: ["C"] },
];

describe("setlist helpers", () => {
  it("adds trimmed songs and ignores blanks", () => {
    let s = emptySets();
    s = addSong(s, 0, "  Tweezer ");
    s = addSong(s, 0, "   ");
    expect(s[0]!.songs).toEqual(["Tweezer"]);
  });

  it("does not mutate the input", () => {
    const s = two();
    addSong(s, 0, "X");
    moveSong(s, 0, 0, 1);
    expect(s[0]!.songs).toEqual(["A", "B"]);
  });

  it("removes songs", () => {
    expect(removeSong(two(), 0, 0)[0]!.songs).toEqual(["B"]);
  });

  it("moves within a set and across set edges", () => {
    expect(moveSong(two(), 0, 0, 1)[0]!.songs).toEqual(["B", "A"]);
    const down = moveSong(two(), 0, 1, 1);
    expect(down[0]!.songs).toEqual(["A"]);
    expect(down[1]!.songs).toEqual(["B", "C"]);
    const up = moveSong(two(), 1, 0, -1);
    expect(up[0]!.songs).toEqual(["A", "B", "C"]);
    expect(up[1]!.songs).toEqual([]);
    expect(moveSong(two(), 0, 0, -1)).toEqual(two());
    expect(canMove(two(), 0, 0, -1)).toBe(false);
    expect(canMove(two(), 1, 0, 1)).toBe(false);
  });

  it("adds sets before encores and renumbers", () => {
    let s = emptySets();
    s = addSet(s, true);
    expect(s.map((x) => x.name)).toEqual(["Set", "Encore"]);
    s = addSet(s, false);
    expect(s.map((x) => x.name)).toEqual(["Set 1", "Set 2", "Encore"]);
    s = addSet(s, true);
    expect(s.map((x) => x.name)).toEqual(["Set 1", "Set 2", "Encore 1", "Encore 2"]);
    s = removeSet(s, 1);
    expect(s.map((x) => x.name)).toEqual(["Set", "Encore 1", "Encore 2"]);
    expect(removeSet(emptySets(), 0)).toHaveLength(1);
  });

  it("cleans for the API", () => {
    const s: SetDraft[] = [
      { name: " ", encore: false, songs: [" A ", ""] },
      { name: "Encore", encore: true, songs: [] },
    ];
    expect(cleanSets(s)).toEqual([{ name: "Set", encore: false, songs: ["A"] }]);
  });

  it("rebuilds sets from saved rows", () => {
    const rows = [
      { set_index: 1, set_name: "Encore", is_encore: true, position: 3, name: "C" },
      { set_index: 0, set_name: "Set 1", is_encore: false, position: 1, name: "A" },
      { set_index: 0, set_name: "Set 1", is_encore: false, position: 2, name: "B" },
    ];
    expect(fromSetlist(rows)).toEqual([
      { name: "Set 1", encore: false, songs: ["A", "B"] },
      { name: "Encore", encore: true, songs: ["C"] },
    ]);
    expect(fromSetlist([])).toEqual(emptySets());
  });

  it("numbers songs across sets", () => {
    expect(songNumber(two(), 1, 0)).toBe("03");
    expect(totalSongs(two())).toBe(3);
  });
});
