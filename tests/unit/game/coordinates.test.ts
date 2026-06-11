import { describe, expect, it } from "vitest";

import {
  addCoordinates,
  coordinateKey,
  isInsideBoard,
} from "../../../src/game";
import type { BoardSize, Coordinate } from "../../../src/game";

const boardSize: BoardSize = { width: 8, height: 8 };

describe("coordinate utilities", () => {
  it("treats all 8x8 corners as inside the board", () => {
    expect(isInsideBoard({ row: 0, col: 0 }, boardSize)).toBe(true);
    expect(isInsideBoard({ row: 0, col: 7 }, boardSize)).toBe(true);
    expect(isInsideBoard({ row: 7, col: 0 }, boardSize)).toBe(true);
    expect(isInsideBoard({ row: 7, col: 7 }, boardSize)).toBe(true);
  });

  it("rejects negative and upper-bound coordinates", () => {
    expect(isInsideBoard({ row: -1, col: 0 }, boardSize)).toBe(false);
    expect(isInsideBoard({ row: 0, col: -1 }, boardSize)).toBe(false);
    expect(isInsideBoard({ row: 8, col: 0 }, boardSize)).toBe(false);
    expect(isInsideBoard({ row: 0, col: 8 }, boardSize)).toBe(false);
  });

  it("adds coordinates without mutating inputs", () => {
    const origin: Coordinate = { row: 3, col: 3 };
    const offset: Coordinate = { row: 1, col: -2 };

    expect(addCoordinates(origin, offset)).toEqual({ row: 4, col: 1 });
    expect(origin).toEqual({ row: 3, col: 3 });
    expect(offset).toEqual({ row: 1, col: -2 });
  });

  it("creates stable coordinate keys", () => {
    expect(coordinateKey({ row: 3, col: 5 })).toBe("3:5");
    expect(coordinateKey({ row: 3, col: 5 })).toBe(
      coordinateKey({ row: 3, col: 5 }),
    );
  });
});
