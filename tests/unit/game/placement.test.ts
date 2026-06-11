import { describe, expect, it } from "vitest";

import {
  getInitialPlacementCoordinates,
  isCoordinateInInitialPlacementArea,
} from "../../../src/game";
import type { BoardSize } from "../../../src/game";

const boardSize: BoardSize = { width: 8, height: 8 };

describe("initial placement area", () => {
  it("returns the upper two rows for north", () => {
    const coordinates = getInitialPlacementCoordinates("north", boardSize, 2);

    expect(coordinates).toHaveLength(16);
    expect(coordinates.every((coordinate) => coordinate.row < 2)).toBe(true);
    expect(coordinates).toContainEqual({ row: 0, col: 0 });
    expect(coordinates).toContainEqual({ row: 1, col: 7 });
  });

  it("returns the lower two rows for south", () => {
    const coordinates = getInitialPlacementCoordinates("south", boardSize, 2);

    expect(coordinates).toHaveLength(16);
    expect(coordinates.every((coordinate) => coordinate.row >= 6)).toBe(true);
    expect(coordinates).toContainEqual({ row: 6, col: 0 });
    expect(coordinates).toContainEqual({ row: 7, col: 7 });
  });

  it("allows placement depth changes", () => {
    const coordinates = getInitialPlacementCoordinates("north", boardSize, 3);

    expect(coordinates).toHaveLength(24);
    expect(coordinates).toContainEqual({ row: 2, col: 7 });
  });

  it("rejects outside-board coordinates", () => {
    expect(
      isCoordinateInInitialPlacementArea({ row: -1, col: 0 }, "north", boardSize, 2),
    ).toBe(false);
    expect(
      isCoordinateInInitialPlacementArea({ row: 8, col: 0 }, "south", boardSize, 2),
    ).toBe(false);
  });
});
