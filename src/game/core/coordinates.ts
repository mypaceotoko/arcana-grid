export type Coordinate = {
  row: number;
  col: number;
};

export type BoardSize = {
  width: number;
  height: number;
};

export const isInsideBoard = (
  coordinate: Coordinate,
  boardSize: BoardSize,
): boolean =>
  coordinate.row >= 0 &&
  coordinate.col >= 0 &&
  coordinate.row < boardSize.height &&
  coordinate.col < boardSize.width;

export const areCoordinatesEqual = (
  left: Coordinate,
  right: Coordinate,
): boolean => left.row === right.row && left.col === right.col;

export const addCoordinates = (
  coordinate: Coordinate,
  offset: Coordinate,
): Coordinate => ({
  row: coordinate.row + offset.row,
  col: coordinate.col + offset.col,
});

export const coordinateKey = (coordinate: Coordinate): string =>
  `${coordinate.row}:${coordinate.col}`;

export const sortCoordinates = <T extends { readonly destination: Coordinate }>(
  values: readonly T[],
): T[] =>
  [...values].sort((left, right) => {
    const rowDiff = left.destination.row - right.destination.row;

    if (rowDiff !== 0) {
      return rowDiff;
    }

    return left.destination.col - right.destination.col;
  });
