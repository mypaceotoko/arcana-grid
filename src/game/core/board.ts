import type { MatchPlayerId } from "./types";
import type { UnitState } from "./state";
import type { Coordinate } from "./coordinates";
import { areCoordinatesEqual } from "./coordinates";

export type SquareOccupancy =
  | { kind: "empty" }
  | { kind: "friendly"; unit: UnitState }
  | { kind: "enemy"; unit: UnitState };

export const getBoardUnits = (
  units: readonly UnitState[],
): readonly UnitState[] =>
  units.filter((unit) => unit.status === "board" && unit.position !== null);

export const getUnitAtCoordinate = (
  units: readonly UnitState[],
  coordinate: Coordinate,
): UnitState | null =>
  getBoardUnits(units).find(
    (unit) =>
      unit.position !== null && areCoordinatesEqual(unit.position, coordinate),
  ) ?? null;

export const getSquareOccupancy = (
  units: readonly UnitState[],
  coordinate: Coordinate,
  currentPlayerId: MatchPlayerId,
): SquareOccupancy => {
  const unit = getUnitAtCoordinate(units, coordinate);

  if (unit === null) {
    return { kind: "empty" };
  }

  if (unit.ownerId === currentPlayerId) {
    return { kind: "friendly", unit };
  }

  return { kind: "enemy", unit };
};
