import type { Coordinate, FlagState, Result, RuleError } from "../../core";
import { areCoordinatesEqual, isInsideBoard } from "../../core";
import type {
  ApplyFlagDamageInput,
  ApplyFlagDamageResult,
  GetFlagAreaCoordinatesInput,
  IsCoordinateInFlagAreaInput,
} from "./flag-types";

const DEFAULT_FLAG_DAMAGE_AMOUNT = 1;

const makeRuleError = (
  code: RuleError["code"],
  message: string,
  details?: Record<string, unknown>,
): RuleError => ({ code, message, details });

const cloneCoordinate = (coordinate: Coordinate): Coordinate => ({
  row: coordinate.row,
  col: coordinate.col,
});

const cloneFlagState = (flag: FlagState): FlagState => ({
  ownerId: flag.ownerId,
  damage: flag.damage,
  maxDamage: flag.maxDamage,
});

const isPositiveInteger = (value: number): boolean =>
  Number.isFinite(value) && Number.isInteger(value) && value > 0;

const validateBoardSize = (
  boardSize: GetFlagAreaCoordinatesInput["boardSize"],
): Result<GetFlagAreaCoordinatesInput["boardSize"], RuleError> => {
  if (
    !Number.isFinite(boardSize.width) ||
    !Number.isFinite(boardSize.height) ||
    !Number.isInteger(boardSize.width) ||
    !Number.isInteger(boardSize.height) ||
    boardSize.width <= 0 ||
    boardSize.height <= 0
  ) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_BOARD_SIZE",
        "Board size width and height must be positive finite integers.",
        { boardSize },
      ),
    };
  }

  return {
    ok: true,
    value: { width: boardSize.width, height: boardSize.height },
  };
};

const getCenterColumns = (width: number): readonly number[] => {
  const center = Math.floor(width / 2);

  if (width % 2 === 0) {
    return [center - 1, center];
  }

  return [center];
};

export const getFlagAreaCoordinates = ({
  side,
  boardSize,
}: GetFlagAreaCoordinatesInput): Result<readonly Coordinate[], RuleError> => {
  const boardSizeResult = validateBoardSize(boardSize);

  if (!boardSizeResult.ok) {
    return boardSizeResult;
  }

  const row = side === "north" ? 0 : boardSizeResult.value.height - 1;
  const coordinates = getCenterColumns(boardSizeResult.value.width).map(
    (col): Coordinate => ({ row, col }),
  );

  return { ok: true, value: coordinates };
};

export const isCoordinateInFlagArea = ({
  coordinate,
  side,
  boardSize,
}: IsCoordinateInFlagAreaInput): Result<boolean, RuleError> => {
  const boardSizeResult = validateBoardSize(boardSize);

  if (!boardSizeResult.ok) {
    return boardSizeResult;
  }

  const coordinateCopy = cloneCoordinate(coordinate);

  if (!isInsideBoard(coordinateCopy, boardSizeResult.value)) {
    return {
      ok: false,
      error: makeRuleError(
        "OUT_OF_BOUNDS",
        "Coordinate is outside board.",
        { coordinate: coordinateCopy, boardSize: boardSizeResult.value },
      ),
    };
  }

  const flagAreaResult = getFlagAreaCoordinates({
    side,
    boardSize: boardSizeResult.value,
  });

  if (!flagAreaResult.ok) {
    return flagAreaResult;
  }

  return {
    ok: true,
    value: flagAreaResult.value.some((flagCoordinate) =>
      areCoordinatesEqual(flagCoordinate, coordinateCopy),
    ),
  };
};

export const validateFlagState = (
  flag: FlagState,
): Result<FlagState, RuleError> => {
  if (
    !Number.isFinite(flag.damage) ||
    !Number.isFinite(flag.maxDamage) ||
    !Number.isInteger(flag.damage) ||
    !Number.isInteger(flag.maxDamage) ||
    flag.damage < 0 ||
    flag.maxDamage <= 0 ||
    flag.damage > flag.maxDamage
  ) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_FLAG_STATE",
        "Flag damage must be an integer from zero through maxDamage, and maxDamage must be a positive integer.",
        {
          ownerId: flag.ownerId,
          damage: flag.damage,
          maxDamage: flag.maxDamage,
        },
      ),
    };
  }

  return { ok: true, value: cloneFlagState(flag) };
};

export const applyFlagDamage = (
  input: ApplyFlagDamageInput,
): Result<ApplyFlagDamageResult, RuleError> => {
  const flagResult = validateFlagState(input.flag);

  if (!flagResult.ok) {
    return flagResult;
  }

  const amount = input.amount ?? DEFAULT_FLAG_DAMAGE_AMOUNT;

  if (!isPositiveInteger(amount)) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_FLAG_DAMAGE",
        "Flag damage amount must be a positive finite integer.",
        { amount },
      ),
    };
  }

  const previousDamage = flagResult.value.damage;
  const damage = Math.min(
    flagResult.value.maxDamage,
    flagResult.value.damage + amount,
  );
  const appliedDamage = damage - previousDamage;
  const flag: FlagState = {
    ...flagResult.value,
    damage,
  };
  const reachedMaximum = damage === flag.maxDamage;

  return {
    ok: true,
    value: {
      flag,
      previousDamage,
      appliedDamage,
      reachedMaximum,
      events:
        appliedDamage > 0
          ? [
              {
                type: "FLAG_DAMAGED",
                ownerId: flag.ownerId,
                previousDamage,
                damage,
                appliedDamage,
                maxDamage: flag.maxDamage,
              },
            ]
          : [],
    },
  };
};

export const isFlagAtMaximumDamage = (
  flag: FlagState,
): Result<boolean, RuleError> => {
  const flagResult = validateFlagState(flag);

  if (!flagResult.ok) {
    return flagResult;
  }

  return {
    ok: true,
    value: flagResult.value.damage === flagResult.value.maxDamage,
  };
};
