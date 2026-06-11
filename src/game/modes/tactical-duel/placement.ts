import type { BoardSize, Coordinate, PlayerSide } from "../../core";
import { isInsideBoard } from "../../core";

export const getInitialPlacementCoordinates = (
  side: PlayerSide,
  boardSize: BoardSize,
  placementDepth: number,
): readonly Coordinate[] => {
  const depth = Math.max(0, Math.min(placementDepth, boardSize.height));
  const startRow = side === "north" ? 0 : boardSize.height - depth;
  const coordinates: Coordinate[] = [];

  for (let row = startRow; row < startRow + depth; row += 1) {
    for (let col = 0; col < boardSize.width; col += 1) {
      coordinates.push({ row, col });
    }
  }

  return coordinates;
};

export const isCoordinateInInitialPlacementArea = (
  coordinate: Coordinate,
  side: PlayerSide,
  boardSize: BoardSize,
  placementDepth: number,
): boolean => {
  if (!isInsideBoard(coordinate, boardSize)) {
    return false;
  }

  const depth = Math.max(0, Math.min(placementDepth, boardSize.height));

  if (side === "north") {
    return coordinate.row < depth;
  }

  return coordinate.row >= boardSize.height - depth;
};
