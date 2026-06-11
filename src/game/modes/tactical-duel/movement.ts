import type {
  BoardSize,
  Coordinate,
  MovementRule,
  Result,
  RuleError,
  UnitState,
} from "../../core";
import {
  addCoordinates,
  coordinateKey,
  getSquareOccupancy,
  isInsideBoard,
  sortCoordinates,
} from "../../core";
import type { TacticalRuleConfig } from "./types";

export type LegalMoveKind = "move" | "engage";

export type LegalMove = {
  destination: Coordinate;
  kind: LegalMoveKind;
};

export type CalculateLegalMovesInput = {
  unit: UnitState;
  units: readonly UnitState[];
  boardSize: BoardSize;
  movementRule: MovementRule;
  config: TacticalRuleConfig;
};

type MovementContext = {
  unit: UnitState;
  units: readonly UnitState[];
  boardSize: BoardSize;
  rule: MovementRule;
  friendlyPassThrough: boolean;
  friendlyStopAllowed: boolean;
  enemyPassThrough: boolean;
};

const makeRuleError = (
  code: RuleError["code"],
  message: string,
  details?: Record<string, unknown>,
): RuleError => ({ code, message, details });

const addMoveCandidate = (
  movesByDestination: Map<string, LegalMove>,
  move: LegalMove,
): void => {
  const key = coordinateKey(move.destination);
  const existing = movesByDestination.get(key);

  if (existing === undefined || existing.kind === "move") {
    movesByDestination.set(key, move);
  }
};

const getLineLegalMoves = (context: MovementContext): readonly LegalMove[] => {
  if (context.rule.kind !== "line") {
    return [];
  }

  const origin = context.unit.position;

  if (origin === null) {
    return [];
  }

  const movesByDestination = new Map<string, LegalMove>();

  for (const direction of context.rule.directions) {
    let distance = 1;
    let cursor = addCoordinates(origin, direction);

    while (
      isInsideBoard(cursor, context.boardSize) &&
      (context.rule.maxDistance === null || distance <= context.rule.maxDistance)
    ) {
      const occupancy = getSquareOccupancy(
        context.units,
        cursor,
        context.unit.ownerId,
      );

      if (occupancy.kind === "empty") {
        addMoveCandidate(movesByDestination, {
          destination: cursor,
          kind: "move",
        });
      } else if (occupancy.kind === "friendly") {
        if (context.friendlyStopAllowed) {
          addMoveCandidate(movesByDestination, {
            destination: cursor,
            kind: "move",
          });
        }

        if (!context.friendlyPassThrough) {
          break;
        }
      } else {
        addMoveCandidate(movesByDestination, {
          destination: cursor,
          kind: "engage",
        });

        if (!context.enemyPassThrough) {
          break;
        }
      }

      distance += 1;
      cursor = addCoordinates(cursor, direction);
    }
  }

  return sortCoordinates([...movesByDestination.values()]);
};

const getOffsetLegalMoves = (context: MovementContext): readonly LegalMove[] => {
  if (context.rule.kind !== "offset") {
    return [];
  }

  const origin = context.unit.position;

  if (origin === null) {
    return [];
  }

  const movesByDestination = new Map<string, LegalMove>();

  for (const offset of context.rule.offsets) {
    const destination = addCoordinates(origin, offset);

    if (!isInsideBoard(destination, context.boardSize)) {
      continue;
    }

    // Non-jumping offset path geometry is intentionally not inferred from an
    // arbitrary offset. Callers must provide final offsets for this Task 3 scope.
    void context.rule.canJump;

    const occupancy = getSquareOccupancy(
      context.units,
      destination,
      context.unit.ownerId,
    );

    if (occupancy.kind === "friendly") {
      continue;
    }

    addMoveCandidate(movesByDestination, {
      destination,
      kind: occupancy.kind === "enemy" ? "engage" : "move",
    });
  }

  return sortCoordinates([...movesByDestination.values()]);
};

const isKnownMovementRule = (rule: MovementRule): boolean =>
  rule.kind === "line" || rule.kind === "offset";

export const calculateLegalMoves = ({
  unit,
  units,
  boardSize,
  movementRule,
  config,
}: CalculateLegalMovesInput): Result<readonly LegalMove[], RuleError> => {
  if (unit.status === "defeated") {
    return {
      ok: false,
      error: makeRuleError("UNIT_DEFEATED", "Defeated units cannot move.", {
        unitId: unit.id,
      }),
    };
  }

  if (unit.status !== "board" || unit.position === null) {
    return {
      ok: false,
      error: makeRuleError("UNIT_NOT_ON_BOARD", "Unit is not on the board.", {
        unitId: unit.id,
      }),
    };
  }

  if (!isInsideBoard(unit.position, boardSize)) {
    return {
      ok: false,
      error: makeRuleError("OUT_OF_BOUNDS", "Unit position is outside board.", {
        unitId: unit.id,
        position: unit.position,
      }),
    };
  }

  if (!isKnownMovementRule(movementRule)) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_MOVEMENT_RULE",
        "Movement rule kind is not supported.",
        { rule: movementRule },
      ),
    };
  }

  const context: MovementContext = {
    unit,
    units,
    boardSize,
    rule: movementRule,
    friendlyPassThrough: config.friendlyPassThrough,
    friendlyStopAllowed: config.friendlyStopAllowed,
    enemyPassThrough: config.enemyPassThrough,
  };

  if (movementRule.kind === "line") {
    return { ok: true, value: getLineLegalMoves(context) };
  }

  if (movementRule.kind === "offset") {
    return { ok: true, value: getOffsetLegalMoves(context) };
  }

  return {
    ok: false,
    error: makeRuleError("INVALID_MOVEMENT_RULE", "Movement rule is invalid."),
  };
};
