import type {
  MatchPlayerId,
  MatchPlayerState,
  MatchState,
  PlayerSide,
  Result,
  RuleError,
  Stance,
  UnitId,
  UnitState,
} from "../../core";
import { coordinateKey, isInsideBoard } from "../../core";
import { isCoordinateInFlagArea } from "./flag";
import { isCoordinateInInitialPlacementArea } from "./placement";
import type { TacticalDuelActionResult } from "./reducer-types";
import type { StartTacticalDuelMatchInput } from "./match-start-types";
import type { TacticalRuleConfig } from "./types";

const FIRST_TURN_NUMBER = 1;
const SETUP_TURN_NUMBER = 0;
const REQUIRED_PLAYER_COUNT = 2;

const makeRuleError = (
  code: RuleError["code"],
  message: string,
  details?: Record<string, unknown>,
): RuleError => ({ code, message, details });

const isValidStance = (stance: Stance): boolean =>
  stance === "attack" || stance === "defense";

const validateMatchSetupState = ({
  state,
  expectedStateVersion,
}: Pick<StartTacticalDuelMatchInput, "state" | "expectedStateVersion">): Result<
  true,
  RuleError
> => {
  if (state.gameMode !== "tactical_duel") {
    return {
      ok: false,
      error: makeRuleError(
        "UNSUPPORTED_GAME_MODE",
        "Match start is only supported for tactical_duel matches.",
        { gameMode: state.gameMode },
      ),
    };
  }

  if (state.phase === "active" || state.phase === "finished") {
    return {
      ok: false,
      error: makeRuleError("MATCH_ALREADY_STARTED", "Match has already started.", {
        phase: state.phase,
      }),
    };
  }

  if (state.phase !== "setup") {
    return {
      ok: false,
      error: makeRuleError("INVALID_MATCH_SETUP_STATE", "Match must be in setup phase.", {
        phase: state.phase,
      }),
    };
  }

  if (state.currentTurnPlayerId !== null) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_MATCH_SETUP_STATE",
        "Setup matches must not have a current turn player.",
        { currentTurnPlayerId: state.currentTurnPlayerId },
      ),
    };
  }

  if (state.turnNumber !== SETUP_TURN_NUMBER) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_MATCH_SETUP_STATE",
        "Setup matches must have turnNumber 0 before match start.",
        { turnNumber: state.turnNumber },
      ),
    };
  }

  if (state.winnerPlayerId !== null || state.winReason !== null) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_MATCH_SETUP_STATE",
        "Setup matches must not have a winner or win reason.",
        { winnerPlayerId: state.winnerPlayerId, winReason: state.winReason },
      ),
    };
  }

  if (state.stateVersion !== expectedStateVersion) {
    return {
      ok: false,
      error: makeRuleError(
        "STALE_STATE_VERSION",
        "expectedStateVersion must match current stateVersion.",
        {
          stateVersion: state.stateVersion,
          expectedStateVersion,
        },
      ),
    };
  }

  return { ok: true, value: true };
};

type ValidatedPlayers = {
  readonly playerIds: ReadonlySet<MatchPlayerId>;
  readonly playerById: ReadonlyMap<MatchPlayerId, MatchPlayerState>;
};

const validatePlayers = (
  players: readonly MatchPlayerState[],
  firstPlayerId: MatchPlayerId,
): Result<ValidatedPlayers, RuleError> => {
  if (players.length !== REQUIRED_PLAYER_COUNT) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_PLAYER_COUNT",
        "Tactical duel match start requires exactly two players.",
        { playerCount: players.length },
      ),
    };
  }

  const playerIds = new Set<MatchPlayerId>();
  const sides = new Set<PlayerSide>();
  const playerById = new Map<MatchPlayerId, MatchPlayerState>();

  for (const player of players) {
    if (playerIds.has(player.id)) {
      return {
        ok: false,
        error: makeRuleError("DUPLICATE_MATCH_PLAYER", "Match player ids must be unique.", {
          playerId: player.id,
        }),
      };
    }

    if (sides.has(player.side)) {
      return {
        ok: false,
        error: makeRuleError("INVALID_PLAYER_SIDES", "Player sides must be unique.", {
          side: player.side,
        }),
      };
    }

    playerIds.add(player.id);
    sides.add(player.side);
    playerById.set(player.id, player);
  }

  if (!sides.has("north") || !sides.has("south")) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_PLAYER_SIDES",
        "Tactical duel match start requires one north player and one south player.",
        { sides: [...sides] },
      ),
    };
  }

  if (!playerIds.has(firstPlayerId)) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_FIRST_PLAYER",
        "firstPlayerId must reference one of the match players.",
        { firstPlayerId },
      ),
    };
  }

  const unsubmittedPlayerIds = players
    .filter((player) => !player.setupSubmitted)
    .map((player) => player.id);

  if (unsubmittedPlayerIds.length > 0) {
    return {
      ok: false,
      error: makeRuleError(
        "INITIAL_PLACEMENT_NOT_COMPLETE",
        "Both players must submit initial placement before match start.",
        { unsubmittedPlayerIds },
      ),
    };
  }

  return { ok: true, value: { playerIds, playerById } };
};

const validateUniqueUnitIds = (
  units: readonly UnitState[],
): Result<ReadonlyMap<UnitId, UnitState>, RuleError> => {
  const unitById = new Map<UnitId, UnitState>();

  for (const unit of units) {
    if (unitById.has(unit.id)) {
      return {
        ok: false,
        error: makeRuleError("DUPLICATE_UNIT", "Unit ids must be unique.", {
          unitId: unit.id,
        }),
      };
    }

    unitById.set(unit.id, unit);
  }

  return { ok: true, value: unitById };
};

const validateReserveUnitIds = (
  player: MatchPlayerState,
  unitById: ReadonlyMap<UnitId, UnitState>,
  config: TacticalRuleConfig,
): Result<ReadonlySet<UnitId>, RuleError> => {
  if (player.reserveUnitIds.length !== config.reserveUnitCount) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_SETUP_UNIT_COUNT",
        "reserveUnitIds must contain exactly the configured reserve unit count.",
        {
          playerId: player.id,
          reserveUnitCount: player.reserveUnitIds.length,
          expectedReserveUnitCount: config.reserveUnitCount,
        },
      ),
    };
  }

  const reserveUnitIds = new Set<UnitId>();

  for (const unitId of player.reserveUnitIds) {
    if (reserveUnitIds.has(unitId)) {
      return {
        ok: false,
        error: makeRuleError("INVALID_SETUP_UNIT_COUNT", "reserveUnitIds must be unique.", {
          playerId: player.id,
          unitId,
        }),
      };
    }

    const unit = unitById.get(unitId);
    if (unit === undefined) {
      return {
        ok: false,
        error: makeRuleError(
          "INVALID_SETUP_UNIT_STATUS",
          "reserveUnitIds must reference existing units.",
          { playerId: player.id, unitId },
        ),
      };
    }

    if (unit.ownerId !== player.id) {
      return {
        ok: false,
        error: makeRuleError(
          "INVALID_SETUP_UNIT_STATUS",
          "reserveUnitIds must reference units owned by the player.",
          { playerId: player.id, unitId, ownerId: unit.ownerId },
        ),
      };
    }

    if (unit.status !== "reserve" || unit.position !== null) {
      return {
        ok: false,
        error: makeRuleError(
          "INVALID_SETUP_UNIT_STATUS",
          "reserveUnitIds units must be reserve units without board positions.",
          { unitId: unit.id, status: unit.status, position: unit.position },
        ),
      };
    }

    reserveUnitIds.add(unitId);
  }

  return { ok: true, value: reserveUnitIds };
};

const validateBoardUnitPlacement = (
  unit: UnitState,
  player: MatchPlayerState,
  state: MatchState,
  config: TacticalRuleConfig,
): Result<true, RuleError> => {
  if (unit.position === null) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_SETUP_UNIT_POSITION",
        "Board units must have a position before match start.",
        { unitId: unit.id },
      ),
    };
  }

  if (!Number.isFinite(unit.currentDefense) || unit.currentDefense <= 0) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_SETUP_UNIT_STATUS",
        "Board units must have positive finite currentDefense before match start.",
        { unitId: unit.id, currentDefense: unit.currentDefense },
      ),
    };
  }

  if (!isValidStance(unit.stance)) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_SETUP_UNIT_STATUS",
        "Board units must have attack or defense stance before match start.",
        { unitId: unit.id, stance: unit.stance },
      ),
    };
  }

  if (!isInsideBoard(unit.position, state.boardSize)) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_SETUP_UNIT_POSITION",
        "Board unit position must be inside the board before match start.",
        { unitId: unit.id, position: unit.position, boardSize: state.boardSize },
      ),
    };
  }

  if (
    !isCoordinateInInitialPlacementArea(
      unit.position,
      player.side,
      state.boardSize,
      config.initialPlacementDepth,
    )
  ) {
    return {
      ok: false,
      error: makeRuleError(
        "SETUP_UNIT_OUTSIDE_PLACEMENT_AREA",
        "Board unit position must be inside its owner's initial placement area.",
        { unitId: unit.id, position: unit.position, side: player.side },
      ),
    };
  }

  const flagAreaResult = isCoordinateInFlagArea({
    coordinate: unit.position,
    side: player.side,
    boardSize: state.boardSize,
  });

  if (!flagAreaResult.ok) {
    return flagAreaResult;
  }

  if (flagAreaResult.value) {
    return {
      ok: false,
      error: makeRuleError(
        "SETUP_UNIT_ON_FLAG_AREA",
        "Board unit position must not be in its owner's flag area.",
        { unitId: unit.id, position: unit.position, side: player.side },
      ),
    };
  }

  return { ok: true, value: true };
};

const validatePlayerUnits = (
  player: MatchPlayerState,
  state: MatchState,
  unitById: ReadonlyMap<UnitId, UnitState>,
  config: TacticalRuleConfig,
): Result<true, RuleError> => {
  const reserveUnitIdsResult = validateReserveUnitIds(player, unitById, config);
  if (!reserveUnitIdsResult.ok) {
    return reserveUnitIdsResult;
  }

  const reserveUnitIds = reserveUnitIdsResult.value;
  const ownedUnits = state.units.filter((unit) => unit.ownerId === player.id);
  const expectedTotalUnitCount = config.initialUnitCount + config.reserveUnitCount;

  if (ownedUnits.length !== expectedTotalUnitCount) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_SETUP_UNIT_COUNT",
        "Owned unit count must match configured initial plus reserve counts.",
        {
          playerId: player.id,
          unitCount: ownedUnits.length,
          expectedUnitCount: expectedTotalUnitCount,
        },
      ),
    };
  }

  const boardUnits = ownedUnits.filter((unit) => !reserveUnitIds.has(unit.id));
  if (boardUnits.length !== config.initialUnitCount) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_SETUP_UNIT_COUNT",
        "Non-reserve owned unit count must match configured initial unit count.",
        {
          playerId: player.id,
          initialUnitCount: boardUnits.length,
          expectedInitialUnitCount: config.initialUnitCount,
        },
      ),
    };
  }

  for (const unit of boardUnits) {
    if (unit.status !== "board") {
      return {
        ok: false,
        error: makeRuleError(
          "INVALID_SETUP_UNIT_STATUS",
          "Initial units must be on the board before match start.",
          { unitId: unit.id, status: unit.status },
        ),
      };
    }

    const placementResult = validateBoardUnitPlacement(unit, player, state, config);
    if (!placementResult.ok) {
      return placementResult;
    }
  }

  return { ok: true, value: true };
};

const validateAllUnits = (
  state: MatchState,
  players: readonly MatchPlayerState[],
  playerById: ReadonlyMap<MatchPlayerId, MatchPlayerState>,
  config: TacticalRuleConfig,
): Result<true, RuleError> => {
  const unitByIdResult = validateUniqueUnitIds(state.units);
  if (!unitByIdResult.ok) {
    return unitByIdResult;
  }

  const unitById = unitByIdResult.value;
  const occupiedKeys = new Set<string>();

  for (const unit of state.units) {
    if (!playerById.has(unit.ownerId)) {
      return {
        ok: false,
        error: makeRuleError("UNKNOWN_UNIT_OWNER", "Unit owner must be a match player.", {
          unitId: unit.id,
          ownerId: unit.ownerId,
        }),
      };
    }

    if (unit.status === "defeated") {
      return {
        ok: false,
        error: makeRuleError(
          "INVALID_SETUP_UNIT_STATUS",
          "Defeated units are not allowed before match start.",
          { unitId: unit.id, position: unit.position },
        ),
      };
    }

    if (unit.status === "reserve" && unit.position !== null) {
      return {
        ok: false,
        error: makeRuleError(
          "INVALID_SETUP_UNIT_POSITION",
          "Reserve units must not have positions before match start.",
          { unitId: unit.id, position: unit.position },
        ),
      };
    }

    if (unit.status === "board") {
      if (unit.position === null) {
        return {
          ok: false,
          error: makeRuleError(
            "INVALID_SETUP_UNIT_POSITION",
            "Board units must have positions before match start.",
            { unitId: unit.id },
          ),
        };
      }

      const key = coordinateKey(unit.position);
      if (occupiedKeys.has(key)) {
        return {
          ok: false,
          error: makeRuleError(
            "DUPLICATE_BOARD_POSITION",
            "Board unit positions must be unique before match start.",
            { position: unit.position },
          ),
        };
      }

      occupiedKeys.add(key);
    }
  }

  for (const player of players) {
    const playerUnitsResult = validatePlayerUnits(player, state, unitById, config);
    if (!playerUnitsResult.ok) {
      return playerUnitsResult;
    }
  }

  return { ok: true, value: true };
};

const validateVisibility = (
  state: MatchState,
  playerIds: ReadonlySet<MatchPlayerId>,
): Result<true, RuleError> => {
  const unitById = new Map<UnitId, UnitState>(
    state.units.map((unit) => [unit.id, unit]),
  );

  for (const visibility of state.unitVisibilities) {
    const unit = unitById.get(visibility.unitId);
    if (unit === undefined) {
      return {
        ok: false,
        error: makeRuleError(
          "INVALID_SETUP_VISIBILITY",
          "Visibility records must reference existing units.",
          { unitId: visibility.unitId },
        ),
      };
    }

    if (!playerIds.has(visibility.viewerId)) {
      return {
        ok: false,
        error: makeRuleError(
          "INVALID_SETUP_VISIBILITY",
          "Visibility records must reference existing match players.",
          { viewerId: visibility.viewerId },
        ),
      };
    }

    if (visibility.viewerId !== unit.ownerId && visibility.level === "revealed") {
      return {
        ok: false,
        error: makeRuleError(
          "INVALID_SETUP_VISIBILITY",
          "Opponent units must not be revealed before match start.",
          { unitId: visibility.unitId, viewerId: visibility.viewerId },
        ),
      };
    }

    if (visibility.viewerId !== unit.ownerId && visibility.level === "owner_full") {
      return {
        ok: false,
        error: makeRuleError(
          "INVALID_SETUP_VISIBILITY",
          "owner_full visibility is only valid for the owning player.",
          { unitId: visibility.unitId, viewerId: visibility.viewerId },
        ),
      };
    }
  }

  return { ok: true, value: true };
};

export const startTacticalDuelMatch = (
  input: StartTacticalDuelMatchInput,
): Result<TacticalDuelActionResult, RuleError> => {
  const setupStateResult = validateMatchSetupState(input);
  if (!setupStateResult.ok) {
    return setupStateResult;
  }

  const playersResult = validatePlayers(input.state.players, input.firstPlayerId);
  if (!playersResult.ok) {
    return playersResult;
  }

  const unitsResult = validateAllUnits(
    input.state,
    input.state.players,
    playersResult.value.playerById,
    input.config,
  );
  if (!unitsResult.ok) {
    return unitsResult;
  }

  const visibilityResult = validateVisibility(
    input.state,
    playersResult.value.playerIds,
  );
  if (!visibilityResult.ok) {
    return visibilityResult;
  }

  return {
    ok: true,
    value: {
      state: {
        ...input.state,
        phase: "active",
        currentTurnPlayerId: input.firstPlayerId,
        turnNumber: FIRST_TURN_NUMBER,
        stateVersion: input.state.stateVersion + 1,
        winnerPlayerId: null,
        winReason: null,
      },
      events: [
        {
          type: "MATCH_STARTED",
          firstPlayerId: input.firstPlayerId,
          turnNumber: FIRST_TURN_NUMBER,
        },
      ],
    },
  };
};
