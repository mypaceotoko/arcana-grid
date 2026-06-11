import type {
  BoardSize,
  Coordinate,
  GameEventPayload,
  MatchPlayerId,
  PlayerSide,
  Result,
  RuleError,
  Stance,
  UnitId,
  UnitState,
  MatchPlayerState,
} from "../../core";
import {
  coordinateKey,
  getBoardUnits,
  getUnitAtCoordinate,
  isInsideBoard,
} from "../../core";
import { isCoordinateInFlagArea } from "./flag";
import {
  getInitialPlacementCoordinates,
  isCoordinateInInitialPlacementArea,
} from "./placement";
import type {
  CanPlayerDeployReserveInput,
  GetReserveDeploymentCoordinatesInput,
  ReserveDeploymentContext,
  ReserveDeploymentResult,
} from "./reserve-types";

const makeRuleError = (
  code: RuleError["code"],
  message: string,
  details?: Record<string, unknown>,
): RuleError => ({ code, message, details });

const compareText = (left: string, right: string): number => {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
};

const cloneCoordinate = (coordinate: Coordinate): Coordinate => ({
  row: coordinate.row,
  col: coordinate.col,
});

const isValidBoardSize = (boardSize: BoardSize): boolean =>
  Number.isFinite(boardSize.width) &&
  Number.isFinite(boardSize.height) &&
  Number.isInteger(boardSize.width) &&
  Number.isInteger(boardSize.height) &&
  boardSize.width > 0 &&
  boardSize.height > 0;

const validateBoardSize = (boardSize: BoardSize): Result<BoardSize, RuleError> => {
  if (!isValidBoardSize(boardSize)) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_BOARD_SIZE",
        "Board size width and height must be positive finite integers.",
        { boardSize },
      ),
    };
  }

  return { ok: true, value: { width: boardSize.width, height: boardSize.height } };
};

const isValidStance = (stance: Stance): boolean =>
  stance === "attack" || stance === "defense";

type NormalizedReservePlayer = {
  id: MatchPlayerId;
  side: PlayerSide;
  flagOwnerId: MatchPlayerState["flag"]["ownerId"] | null;
};

const getReservePlayer = (
  input: GetReserveDeploymentCoordinatesInput | ReserveDeploymentContext,
): NormalizedReservePlayer => {
  if (input.player !== undefined) {
    return {
      id: input.player.id,
      side: input.player.side,
      flagOwnerId: input.player.flag.ownerId,
    };
  }

  return { id: input.playerId, side: input.side, flagOwnerId: null };
};

const validatePlayerContext = (
  player: NormalizedReservePlayer,
): Result<true, RuleError> => {
  if (player.flagOwnerId !== null && player.flagOwnerId !== player.id) {
    return {
      ok: false,
      error: makeRuleError(
        "PLAYER_SIDE_MISMATCH",
        "Reserve deployment player context must belong to the acting player.",
        { playerId: player.id, flagOwnerId: player.flagOwnerId },
      ),
    };
  }

  return { ok: true, value: true };
};

const validateUniqueUnitIds = (
  units: readonly UnitState[],
): Result<true, RuleError> => {
  const unitIds = new Set<UnitId>();

  for (const unit of units) {
    if (unitIds.has(unit.id)) {
      return {
        ok: false,
        error: makeRuleError("DUPLICATE_UNIT", "Unit ids must be unique.", {
          unitId: unit.id,
        }),
      };
    }

    unitIds.add(unit.id);
  }

  return { ok: true, value: true };
};

const validateBaseDefense = (unit: UnitState): Result<true, RuleError> => {
  if (!Number.isFinite(unit.card.baseDefense) || unit.card.baseDefense <= 0) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_UNIT_BASE_DEFENSE",
        "Reserve unit base defense must be a positive finite number.",
        { unitId: unit.id, baseDefense: unit.card.baseDefense },
      ),
    };
  }

  return { ok: true, value: true };
};

const getOwnedUnits = (
  units: readonly UnitState[],
  playerId: MatchPlayerId,
): readonly UnitState[] =>
  units
    .filter((unit) => unit.ownerId === playerId)
    .sort((left, right) => compareText(left.id, right.id));

export const getPlayerBoardUnits = (
  units: readonly UnitState[],
  playerId: MatchPlayerId,
): readonly UnitState[] =>
  getOwnedUnits(units, playerId).filter(
    (unit) => unit.status === "board" && unit.position !== null,
  );

export const getPlayerReserveUnits = (
  units: readonly UnitState[],
  playerId: MatchPlayerId,
): readonly UnitState[] =>
  getOwnedUnits(units, playerId).filter((unit) => unit.status === "reserve");

export const canPlayerDeployReserve = ({
  playerId,
  units,
  config,
}: CanPlayerDeployReserveInput): Result<boolean, RuleError> => {
  if (getOwnedUnits(units, playerId).length === 0) {
    return {
      ok: false,
      error: makeRuleError(
        "PLAYER_HAS_NO_UNITS",
        "A player must own at least one unit before reserve deployment can be evaluated.",
        { playerId },
      ),
    };
  }

  const boardUnitCount = getPlayerBoardUnits(units, playerId).length;

  if (boardUnitCount >= config.initialUnitCount) {
    return { ok: true, value: false };
  }

  return {
    ok: true,
    value: getPlayerReserveUnits(units, playerId).length > 0,
  };
};

export const getReserveDeploymentCoordinates = (
  input: GetReserveDeploymentCoordinatesInput,
): Result<readonly Coordinate[], RuleError> => {
  const player = getReservePlayer(input);
  const playerContextResult = validatePlayerContext(player);

  if (!playerContextResult.ok) {
    return playerContextResult;
  }

  const boardSizeResult = validateBoardSize(input.boardSize);

  if (!boardSizeResult.ok) {
    return boardSizeResult;
  }

  const occupiedCoordinates = new Set(
    getBoardUnits(input.units).flatMap((unit) =>
      unit.position === null ? [] : [coordinateKey(unit.position)],
    ),
  );
  const coordinatesByKey = new Map<string, Coordinate>();

  for (const coordinate of getInitialPlacementCoordinates(
    player.side,
    boardSizeResult.value,
    input.config.initialPlacementDepth,
  )) {
    const destination = cloneCoordinate(coordinate);

    if (occupiedCoordinates.has(coordinateKey(destination))) {
      continue;
    }

    const flagResult = isCoordinateInFlagArea({
      coordinate: destination,
      side: player.side,
      boardSize: boardSizeResult.value,
    });

    if (!flagResult.ok) {
      return flagResult;
    }

    if (flagResult.value) {
      continue;
    }

    coordinatesByKey.set(coordinateKey(destination), destination);
  }

  return {
    ok: true,
    value: [...coordinatesByKey.values()].sort((left, right) => {
      const rowDiff = left.row - right.row;
      return rowDiff === 0 ? left.col - right.col : rowDiff;
    }),
  };
};

export const validateReserveDeployment = (
  input: ReserveDeploymentContext,
): Result<true, RuleError> => {
  const player = getReservePlayer(input);
  const duplicateResult = validateUniqueUnitIds(input.units);

  if (!duplicateResult.ok) {
    return duplicateResult;
  }

  const unitInList = input.units.find((unit) => unit.id === input.unit.id);

  if (unitInList === undefined) {
    return {
      ok: false,
      error: makeRuleError(
        "RESERVE_UNIT_NOT_FOUND",
        "Reserve deployment unit must exist in the unit list.",
        { unitId: input.unit.id },
      ),
    };
  }

  const playerContextResult = validatePlayerContext(player);

  if (!playerContextResult.ok) {
    return playerContextResult;
  }

  if (unitInList.ownerId !== player.id || input.unit.ownerId !== player.id) {
    return {
      ok: false,
      error: makeRuleError(
        "RESERVE_OWNER_MISMATCH",
        "Reserve unit owner must match the acting player.",
        {
          unitId: input.unit.id,
          ownerId: input.unit.ownerId,
          playerId: player.id,
        },
      ),
    };
  }

  if (input.unit.status !== "reserve" || unitInList.status !== "reserve") {
    return {
      ok: false,
      error: makeRuleError(
        "UNIT_NOT_IN_RESERVE",
        "Only reserve units can be deployed.",
        { unitId: input.unit.id, status: input.unit.status },
      ),
    };
  }

  if (input.unit.position !== null || unitInList.position !== null) {
    return {
      ok: false,
      error: makeRuleError(
        "UNIT_NOT_IN_RESERVE",
        "Reserve units must not already have a board position.",
        { unitId: input.unit.id, position: input.unit.position },
      ),
    };
  }

  const baseDefenseResult = validateBaseDefense(input.unit);

  if (!baseDefenseResult.ok) {
    return baseDefenseResult;
  }

  const canDeployResult = canPlayerDeployReserve({
    playerId: player.id,
    units: input.units,
    config: input.config,
  });

  if (!canDeployResult.ok) {
    return canDeployResult;
  }

  if (!canDeployResult.value) {
    const reserveCount = getPlayerReserveUnits(input.units, player.id).length;

    return {
      ok: false,
      error: makeRuleError(
        reserveCount === 0
          ? "NO_RESERVE_UNITS"
          : "RESERVE_DEPLOYMENT_LIMIT_REACHED",
        reserveCount === 0
          ? "The acting player has no reserve units to deploy."
          : "The acting player already has the maximum number of board units.",
        {
          playerId: player.id,
          boardUnitCount: getPlayerBoardUnits(input.units, player.id).length,
          reserveCount,
          initialUnitCount: input.config.initialUnitCount,
        },
      ),
    };
  }

  const boardSizeResult = validateBoardSize(input.boardSize);

  if (!boardSizeResult.ok) {
    return boardSizeResult;
  }

  const destination = cloneCoordinate(input.destination);

  if (!isInsideBoard(destination, boardSizeResult.value)) {
    return {
      ok: false,
      error: makeRuleError(
        "OUT_OF_BOUNDS",
        "Reserve deployment destination is outside the board.",
        { destination, boardSize: boardSizeResult.value },
      ),
    };
  }

  if (
    !isCoordinateInInitialPlacementArea(
      destination,
      player.side,
      boardSizeResult.value,
      input.config.initialPlacementDepth,
    )
  ) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_RESERVE_DESTINATION",
        "Reserve units can only be deployed into the player's initial placement area.",
        { destination, side: player.side },
      ),
    };
  }

  const flagResult = isCoordinateInFlagArea({
    coordinate: destination,
    side: player.side,
    boardSize: boardSizeResult.value,
  });

  if (!flagResult.ok) {
    return flagResult;
  }

  if (flagResult.value) {
    return {
      ok: false,
      error: makeRuleError(
        "RESERVE_DESTINATION_IS_FLAG",
        "Reserve units cannot be deployed onto a flag area.",
        { destination, side: player.side },
      ),
    };
  }

  if (getUnitAtCoordinate(input.units, destination) !== null) {
    return {
      ok: false,
      error: makeRuleError(
        "RESERVE_DESTINATION_OCCUPIED",
        "Reserve deployment destination must be empty.",
        { destination },
      ),
    };
  }

  if (!isValidStance(input.stance)) {
    return {
      ok: false,
      error: makeRuleError("INVALID_ACTION", "Reserve stance is invalid.", {
        stance: input.stance,
      }),
    };
  }

  return { ok: true, value: true };
};

const createReserveDeployedEvent = (
  unit: UnitState,
  destination: Coordinate,
  stance: Stance,
): GameEventPayload => ({
  type: "RESERVE_DEPLOYED",
  unitId: unit.id,
  ownerId: unit.ownerId,
  destination,
  stance,
});

export const deployReserveUnit = (
  input: ReserveDeploymentContext,
): Result<ReserveDeploymentResult, RuleError> => {
  const validationResult = validateReserveDeployment(input);

  if (!validationResult.ok) {
    return validationResult;
  }

  const destination = cloneCoordinate(input.destination);
  const unit: UnitState = {
    ...input.unit,
    status: "board",
    position: destination,
    stance: input.stance,
    currentDefense: input.unit.card.baseDefense,
  };

  return {
    ok: true,
    value: {
      unit,
      destination,
      events: [createReserveDeployedEvent(unit, cloneCoordinate(destination), input.stance)],
    },
  };
};
