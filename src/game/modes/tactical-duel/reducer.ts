import type {
  Coordinate,
  GameAction,
  GameEventPayload,
  MatchPlayerId,
  MatchPlayerState,
  MatchState,
  AttackFlagAction,
  ConcedeMatchAction,
  DeployReserveAction,
  MoveUnitAction,
  SubmitInitialPlacementAction,
  Result,
  RuleError,
  Stance,
  UnitId,
  UnitState,
} from "../../core";
import {
  areCoordinatesEqual,
  coordinateKey,
  getUnitAtCoordinate,
  isInsideBoard,
} from "../../core";
import { resolveCombat } from "./combat";
import { deployReserveUnit } from "./reserve";
import {
  applyFlagDamage,
  getFlagAreaCoordinates,
  isCoordinateInFlagArea,
  isFlagAtMaximumDamage,
  validateFlagState,
} from "./flag";
import {
  getInitialPlacementCoordinates,
  isCoordinateInInitialPlacementArea,
} from "./placement";
import { calculateLegalMoves, type LegalMove } from "./movement";
import type { TacticalRuleConfig } from "./types";
import { evaluateTacticalDuelVictory } from "./victory";
import {
  applyRevealOnMoveConfirmed,
  applyRevealWhenAttacked,
} from "./visibility";
import type { TacticalDuelActionResult } from "./reducer-types";
import { advanceTurn, getOpponentPlayerId } from "./turn";

export type ApplyAttackFlagActionInput = {
  state: MatchState;
  action: AttackFlagAction;
  config: TacticalRuleConfig;
};

type ApplyMoveUnitActionInput = {
  state: MatchState;
  action: MoveUnitAction;
  config: TacticalRuleConfig;
};

export type ApplyDeployReserveActionInput = {
  state: MatchState;
  action: DeployReserveAction;
  config: TacticalRuleConfig;
};

export type ApplySubmitInitialPlacementActionInput = {
  state: MatchState;
  action: SubmitInitialPlacementAction;
  config: TacticalRuleConfig;
};

export type ApplyConcedeMatchActionInput = {
  state: MatchState;
  action: ConcedeMatchAction;
  config: TacticalRuleConfig;
};

type UnsupportedTacticalDuelAction = {
  type: "UNSUPPORTED_ACTION";
};

type ApplyTacticalDuelActionInput = {
  state: MatchState;
  action: GameAction | UnsupportedTacticalDuelAction;
  config: TacticalRuleConfig;
};

type ValidatedCommonActionInput = {
  actor: MatchPlayerState;
  opponentId: MatchPlayerId;
};

type ValidatedMoveInput = ValidatedCommonActionInput & {
  unit: UnitState;
  origin: Coordinate;
};

type ValidatedDeployReserveInput = ValidatedCommonActionInput & {
  unit: UnitState;
};

type ValidatedAttackFlagInput = ValidatedCommonActionInput & {
  unit: UnitState;
  defender: MatchPlayerState;
};

type ValidatedSubmitInitialPlacementInput = {
  actor: MatchPlayerState;
  placementUnits: readonly UnitState[];
};

type CommonActionValidationInput = {
  state: MatchState;
  action: Pick<
    MoveUnitAction | AttackFlagAction | DeployReserveAction | ConcedeMatchAction,
    "matchId" | "actorId" | "expectedStateVersion" | "type"
  >;
  requireCurrentTurnActor: boolean;
};

const makeRuleError = (
  code: RuleError["code"],
  message: string,
  details?: Record<string, unknown>,
): RuleError => ({ code, message, details });

const cloneCoordinate = (coordinate: Coordinate): Coordinate => ({
  row: coordinate.row,
  col: coordinate.col,
});

const isValidStance = (stance: Stance): boolean =>
  stance === "attack" || stance === "defense";

const findUnitsById = (
  units: readonly UnitState[],
  unitId: UnitId,
): readonly UnitState[] => units.filter((unit) => unit.id === unitId);

const validatePlayers = (
  state: MatchState,
  action: Pick<
    MoveUnitAction | AttackFlagAction | DeployReserveAction | ConcedeMatchAction,
    "actorId"
  >,
  actorNotFoundCode: Extract<
    RuleError["code"],
    "NOT_YOUR_TURN" | "MATCH_PLAYER_NOT_FOUND"
  >,
): Result<ValidatedCommonActionInput, RuleError> => {
  if (state.players.length !== 2) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_PLAYER_COUNT",
        "Tactical duel actions require exactly two players.",
        { playerCount: state.players.length },
      ),
    };
  }

  const playerIds = new Set<MatchPlayerId>();
  for (const player of state.players) {
    if (playerIds.has(player.id)) {
      return {
        ok: false,
        error: makeRuleError(
          "DUPLICATE_MATCH_PLAYER",
          "Match player ids must be unique.",
          { playerId: player.id },
        ),
      };
    }
    playerIds.add(player.id);
  }

  const actor = state.players.find((player) => player.id === action.actorId);

  if (actor === undefined) {
    return {
      ok: false,
      error: makeRuleError(
        actorNotFoundCode,
        "Actor must be one of the match players.",
        { actorId: action.actorId },
      ),
    };
  }

  const opponentResult = getOpponentPlayerId(state.players, action.actorId);

  if (!opponentResult.ok) {
    return opponentResult;
  }

  return { ok: true, value: { actor, opponentId: opponentResult.value } };
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

const validateCommonAction = ({
  state,
  action,
  requireCurrentTurnActor,
}: CommonActionValidationInput): Result<
  ValidatedCommonActionInput,
  RuleError
> => {
  if (state.id !== action.matchId) {
    return {
      ok: false,
      error: makeRuleError(
        "MATCH_ID_MISMATCH",
        "Action matchId must match state id.",
        { stateMatchId: state.id, actionMatchId: action.matchId },
      ),
    };
  }

  if (state.gameMode !== "tactical_duel") {
    return {
      ok: false,
      error: makeRuleError(
        "UNSUPPORTED_GAME_MODE",
        `${action.type} is only supported for tactical_duel matches.`,
        { gameMode: state.gameMode },
      ),
    };
  }

  if (
    state.phase === "finished" ||
    state.winnerPlayerId !== null ||
    state.winReason !== null
  ) {
    return {
      ok: false,
      error: makeRuleError(
        "MATCH_FINISHED",
        "Finished matches cannot accept actions.",
        {
          phase: state.phase,
          winnerPlayerId: state.winnerPlayerId,
          winReason: state.winReason,
        },
      ),
    };
  }

  if (state.phase !== "active") {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_PHASE",
        `${action.type} requires active phase.`,
        {
          phase: state.phase,
        },
      ),
    };
  }

  if (state.currentTurnPlayerId === null) {
    return {
      ok: false,
      error: makeRuleError(
        "CURRENT_TURN_PLAYER_MISSING",
        "Active matches must have a current turn player.",
      ),
    };
  }

  if (requireCurrentTurnActor && state.currentTurnPlayerId !== action.actorId) {
    return {
      ok: false,
      error: makeRuleError(
        "NOT_YOUR_TURN",
        "Actor is not the current turn player.",
        {
          actorId: action.actorId,
          currentTurnPlayerId: state.currentTurnPlayerId,
        },
      ),
    };
  }

  if (state.stateVersion !== action.expectedStateVersion) {
    return {
      ok: false,
      error: makeRuleError(
        "STALE_STATE_VERSION",
        "Action expectedStateVersion must match current stateVersion.",
        {
          stateVersion: state.stateVersion,
          expectedStateVersion: action.expectedStateVersion,
        },
      ),
    };
  }

  return validatePlayers(
    state,
    action,
    requireCurrentTurnActor ? "NOT_YOUR_TURN" : "MATCH_PLAYER_NOT_FOUND",
  );
};

const validateMoveAction = (
  input: ApplyMoveUnitActionInput,
): Result<ValidatedMoveInput, RuleError> => {
  const { state, action } = input;
  const commonResult = validateCommonAction({
    ...input,
    requireCurrentTurnActor: true,
  });

  if (!commonResult.ok) {
    return commonResult;
  }

  const uniqueUnitsResult = validateUniqueUnitIds(state.units);
  if (!uniqueUnitsResult.ok) {
    return uniqueUnitsResult;
  }

  const targetUnits = findUnitsById(state.units, action.unitId);
  if (targetUnits.length === 0) {
    return {
      ok: false,
      error: makeRuleError("UNIT_NOT_FOUND", "Unit was not found.", {
        unitId: action.unitId,
      }),
    };
  }

  if (targetUnits.length > 1) {
    return {
      ok: false,
      error: makeRuleError("DUPLICATE_UNIT", "Unit ids must be unique.", {
        unitId: action.unitId,
      }),
    };
  }

  const unit = targetUnits[0];

  if (unit.ownerId !== action.actorId) {
    return {
      ok: false,
      error: makeRuleError("UNIT_NOT_OWNED", "Actor does not own the unit.", {
        unitId: unit.id,
        ownerId: unit.ownerId,
        actorId: action.actorId,
      }),
    };
  }

  if (unit.status === "defeated") {
    return {
      ok: false,
      error: makeRuleError("UNIT_DEFEATED", "Defeated units cannot move.", {
        unitId: unit.id,
      }),
    };
  }

  if (unit.status !== "board") {
    return {
      ok: false,
      error: makeRuleError("UNIT_NOT_ON_BOARD", "Only board units can move.", {
        unitId: unit.id,
        status: unit.status,
      }),
    };
  }

  if (unit.position === null) {
    return {
      ok: false,
      error: makeRuleError(
        "UNIT_NOT_ON_BOARD",
        "Board units must have a position.",
        {
          unitId: unit.id,
        },
      ),
    };
  }

  if (!isInsideBoard(action.destination, state.boardSize)) {
    return {
      ok: false,
      error: makeRuleError("OUT_OF_BOUNDS", "Destination is outside board.", {
        destination: action.destination,
        boardSize: state.boardSize,
      }),
    };
  }

  if (!isValidStance(action.nextStance)) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_ACTION",
        "nextStance must be attack or defense.",
        {
          nextStance: action.nextStance,
        },
      ),
    };
  }

  return {
    ok: true,
    value: {
      ...commonResult.value,
      unit,
      origin: cloneCoordinate(unit.position),
    },
  };
};

const validateNoUnitsInFlagAreas = (
  state: MatchState,
): Result<true, RuleError> => {
  for (const player of state.players) {
    const coordinatesResult = getFlagAreaCoordinates({
      side: player.side,
      boardSize: state.boardSize,
    });

    if (!coordinatesResult.ok) {
      return coordinatesResult;
    }

    for (const coordinate of coordinatesResult.value) {
      const occupant = getUnitAtCoordinate(state.units, coordinate);
      if (occupant !== null) {
        return {
          ok: false,
          error: makeRuleError(
            "FLAG_AREA_OCCUPIED",
            "Flag areas must not contain board units.",
            { coordinate, occupantUnitId: occupant.id },
          ),
        };
      }
    }
  }

  return { ok: true, value: true };
};

const validateAttackFlagAction = (
  input: ApplyAttackFlagActionInput,
): Result<ValidatedAttackFlagInput, RuleError> => {
  const { state, action } = input;
  const commonResult = validateCommonAction({
    ...input,
    requireCurrentTurnActor: true,
  });

  if (!commonResult.ok) {
    return commonResult;
  }

  const uniqueUnitsResult = validateUniqueUnitIds(state.units);
  if (!uniqueUnitsResult.ok) {
    return uniqueUnitsResult;
  }

  const targetUnits = findUnitsById(state.units, action.unitId);
  if (targetUnits.length === 0) {
    return {
      ok: false,
      error: makeRuleError("UNIT_NOT_FOUND", "Unit was not found.", {
        unitId: action.unitId,
      }),
    };
  }

  if (targetUnits.length > 1) {
    return {
      ok: false,
      error: makeRuleError("DUPLICATE_UNIT", "Unit ids must be unique.", {
        unitId: action.unitId,
      }),
    };
  }

  const unit = targetUnits[0];
  if (unit.ownerId !== action.actorId) {
    return {
      ok: false,
      error: makeRuleError("UNIT_NOT_OWNED", "Actor does not own the unit.", {
        unitId: unit.id,
        ownerId: unit.ownerId,
        actorId: action.actorId,
      }),
    };
  }

  if (unit.status === "defeated") {
    return {
      ok: false,
      error: makeRuleError("UNIT_DEFEATED", "Defeated units cannot attack flags.", {
        unitId: unit.id,
      }),
    };
  }

  if (unit.status !== "board") {
    return {
      ok: false,
      error: makeRuleError(
        "UNIT_NOT_ON_BOARD",
        "Only board units can attack flags.",
        { unitId: unit.id, status: unit.status },
      ),
    };
  }

  if (unit.position === null) {
    return {
      ok: false,
      error: makeRuleError(
        "UNIT_NOT_ON_BOARD",
        "Board units must have a position before attacking flags.",
        { unitId: unit.id },
      ),
    };
  }

  if (!isValidStance(action.nextStance)) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_ACTION",
        "nextStance must be attack or defense.",
        { nextStance: action.nextStance },
      ),
    };
  }

  if (!isInsideBoard(action.target, state.boardSize)) {
    return {
      ok: false,
      error: makeRuleError("OUT_OF_BOUNDS", "Flag attack target is outside board.", {
        target: action.target,
        boardSize: state.boardSize,
      }),
    };
  }

  const defender = state.players.find(
    (player) => player.id === commonResult.value.opponentId,
  );

  if (defender === undefined) {
    return {
      ok: false,
      error: makeRuleError(
        "MATCH_PLAYER_NOT_FOUND",
        "Opponent player must exist in the match state.",
        { opponentId: commonResult.value.opponentId },
      ),
    };
  }

  const ownFlagAreaResult = isCoordinateInFlagArea({
    coordinate: action.target,
    side: commonResult.value.actor.side,
    boardSize: state.boardSize,
  });

  if (!ownFlagAreaResult.ok) {
    return ownFlagAreaResult;
  }

  if (ownFlagAreaResult.value) {
    return {
      ok: false,
      error: makeRuleError(
        "TARGET_NOT_OPPONENT_FLAG",
        "Actors cannot attack their own flag area.",
        { target: action.target, actorId: action.actorId },
      ),
    };
  }

  const opponentFlagAreaResult = isCoordinateInFlagArea({
    coordinate: action.target,
    side: defender.side,
    boardSize: state.boardSize,
  });

  if (!opponentFlagAreaResult.ok) {
    return opponentFlagAreaResult;
  }

  if (!opponentFlagAreaResult.value) {
    return {
      ok: false,
      error: makeRuleError(
        "TARGET_NOT_OPPONENT_FLAG",
        "Flag attack target must be in the opponent flag area.",
        { target: action.target, defenderPlayerId: defender.id },
      ),
    };
  }

  if (defender.flag.ownerId !== defender.id) {
    return {
      ok: false,
      error: makeRuleError(
        "FLAG_OWNER_MISMATCH",
        "Opponent flag owner must match the opponent player id.",
        { defenderPlayerId: defender.id, flagOwnerId: defender.flag.ownerId },
      ),
    };
  }

  const flagResult = validateFlagState(defender.flag);
  if (!flagResult.ok) {
    return flagResult;
  }

  const flagDestroyedResult = isFlagAtMaximumDamage(defender.flag);
  if (!flagDestroyedResult.ok) {
    return flagDestroyedResult;
  }

  if (flagDestroyedResult.value) {
    return {
      ok: false,
      error: makeRuleError(
        "FLAG_ALREADY_DESTROYED",
        "Active matches cannot attack a flag that is already at maximum damage.",
        { defenderPlayerId: defender.id, damage: defender.flag.damage },
      ),
    };
  }

  const flagOccupancyResult = validateNoUnitsInFlagAreas(state);
  if (!flagOccupancyResult.ok) {
    return flagOccupancyResult;
  }

  return {
    ok: true,
    value: {
      ...commonResult.value,
      unit,
      defender,
    },
  };
};

const validateDeployReserveAction = (
  input: ApplyDeployReserveActionInput,
): Result<ValidatedDeployReserveInput, RuleError> => {
  const { state, action } = input;
  const commonResult = validateCommonAction({
    ...input,
    requireCurrentTurnActor: true,
  });

  if (!commonResult.ok) {
    return commonResult;
  }

  const uniqueUnitsResult = validateUniqueUnitIds(state.units);
  if (!uniqueUnitsResult.ok) {
    return uniqueUnitsResult;
  }

  const targetUnits = findUnitsById(state.units, action.unitId);
  if (targetUnits.length === 0) {
    return {
      ok: false,
      error: makeRuleError("UNIT_NOT_FOUND", "Reserve unit was not found.", {
        unitId: action.unitId,
      }),
    };
  }

  if (targetUnits.length > 1) {
    return {
      ok: false,
      error: makeRuleError("DUPLICATE_UNIT", "Unit ids must be unique.", {
        unitId: action.unitId,
      }),
    };
  }

  const unit = targetUnits[0];

  if (unit.ownerId !== action.actorId) {
    return {
      ok: false,
      error: makeRuleError(
        "UNIT_NOT_OWNED",
        "Actor does not own the reserve unit.",
        {
          unitId: unit.id,
          ownerId: unit.ownerId,
          actorId: action.actorId,
        },
      ),
    };
  }

  if (unit.status === "defeated") {
    return {
      ok: false,
      error: makeRuleError(
        "UNIT_DEFEATED",
        "Defeated units cannot be deployed.",
        {
          unitId: unit.id,
        },
      ),
    };
  }

  if (unit.status !== "reserve") {
    return {
      ok: false,
      error: makeRuleError(
        "UNIT_NOT_IN_RESERVE",
        "Only reserve units can be deployed.",
        {
          unitId: unit.id,
          status: unit.status,
        },
      ),
    };
  }

  if (unit.position !== null) {
    return {
      ok: false,
      error: makeRuleError(
        "UNIT_NOT_IN_RESERVE",
        "Reserve units must not already have a board position.",
        { unitId: unit.id, position: unit.position },
      ),
    };
  }

  if (!isInsideBoard(action.destination, state.boardSize)) {
    return {
      ok: false,
      error: makeRuleError("OUT_OF_BOUNDS", "Destination is outside board.", {
        destination: action.destination,
        boardSize: state.boardSize,
      }),
    };
  }

  if (!isValidStance(action.stance)) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_ACTION",
        "stance must be attack or defense.",
        {
          stance: action.stance,
        },
      ),
    };
  }

  return { ok: true, value: { ...commonResult.value, unit } };
};

const validateSetupAction = ({
  state,
  action,
}: ApplySubmitInitialPlacementActionInput): Result<
  MatchPlayerState,
  RuleError
> => {
  if (state.id !== action.matchId) {
    return {
      ok: false,
      error: makeRuleError(
        "MATCH_ID_MISMATCH",
        "Action matchId must match state id.",
        {
          stateMatchId: state.id,
          actionMatchId: action.matchId,
        },
      ),
    };
  }

  if (state.gameMode !== "tactical_duel") {
    return {
      ok: false,
      error: makeRuleError(
        "UNSUPPORTED_GAME_MODE",
        "SUBMIT_INITIAL_PLACEMENT is only supported for tactical_duel matches.",
        { gameMode: state.gameMode },
      ),
    };
  }

  if (
    state.phase === "finished" ||
    state.winnerPlayerId !== null ||
    state.winReason !== null
  ) {
    return {
      ok: false,
      error: makeRuleError(
        "MATCH_FINISHED",
        "Finished matches cannot accept setup actions.",
        {
          phase: state.phase,
          winnerPlayerId: state.winnerPlayerId,
          winReason: state.winReason,
        },
      ),
    };
  }

  if (state.phase !== "setup") {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_PHASE",
        "SUBMIT_INITIAL_PLACEMENT requires setup phase.",
        { phase: state.phase },
      ),
    };
  }

  if (state.currentTurnPlayerId !== null) {
    return {
      ok: false,
      error: makeRuleError(
        "CURRENT_TURN_PLAYER_MISSING",
        "Setup matches must not have a current turn player.",
        { currentTurnPlayerId: state.currentTurnPlayerId },
      ),
    };
  }

  if (state.stateVersion !== action.expectedStateVersion) {
    return {
      ok: false,
      error: makeRuleError(
        "STALE_STATE_VERSION",
        "Action expectedStateVersion must match current stateVersion.",
        {
          stateVersion: state.stateVersion,
          expectedStateVersion: action.expectedStateVersion,
        },
      ),
    };
  }

  if (state.players.length !== 2) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_PLAYER_COUNT",
        "Setup actions require exactly two players.",
        { playerCount: state.players.length },
      ),
    };
  }

  const playerIds = new Set<MatchPlayerId>();
  let actor: MatchPlayerState | null = null;
  let actorCount = 0;

  for (const player of state.players) {
    if (playerIds.has(player.id)) {
      return {
        ok: false,
        error: makeRuleError(
          "DUPLICATE_MATCH_PLAYER",
          "Match player ids must be unique.",
          {
            playerId: player.id,
          },
        ),
      };
    }

    playerIds.add(player.id);

    if (player.id === action.actorId) {
      actor = player;
      actorCount += 1;
    }
  }

  if (actor === null || actorCount !== 1) {
    return {
      ok: false,
      error: makeRuleError(
        "NOT_YOUR_TURN",
        "Actor must be one of the match players.",
        {
          actorId: action.actorId,
        },
      ),
    };
  }

  if (actor.setupSubmitted) {
    return {
      ok: false,
      error: makeRuleError(
        "INITIAL_PLACEMENT_ALREADY_SUBMITTED",
        "Initial placement has already been submitted.",
        { actorId: action.actorId },
      ),
    };
  }

  return { ok: true, value: actor };
};

const validateReserveUnitIds = (
  actor: MatchPlayerState,
  units: readonly UnitState[],
  config: TacticalRuleConfig,
): Result<ReadonlySet<UnitId>, RuleError> => {
  if (actor.reserveUnitIds.length !== config.reserveUnitCount) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_RESERVE_UNIT_IDS",
        "reserveUnitIds must contain exactly the configured reserve unit count.",
        {
          playerId: actor.id,
          reserveUnitCount: actor.reserveUnitIds.length,
          expectedReserveUnitCount: config.reserveUnitCount,
        },
      ),
    };
  }

  const reserveSet = new Set<UnitId>();
  for (const unitId of actor.reserveUnitIds) {
    if (reserveSet.has(unitId)) {
      return {
        ok: false,
        error: makeRuleError(
          "INVALID_RESERVE_UNIT_IDS",
          "reserveUnitIds must be unique.",
          {
            playerId: actor.id,
            unitId,
          },
        ),
      };
    }

    const matchingUnits = findUnitsById(units, unitId);
    if (matchingUnits.length !== 1) {
      return {
        ok: false,
        error: makeRuleError(
          "INVALID_RESERVE_UNIT_IDS",
          "Each reserveUnitIds entry must reference exactly one unit.",
          { playerId: actor.id, unitId, unitCount: matchingUnits.length },
        ),
      };
    }

    if (matchingUnits[0].ownerId !== actor.id) {
      return {
        ok: false,
        error: makeRuleError(
          "INVALID_RESERVE_UNIT_IDS",
          "Reserve unit ids must reference units owned by the player.",
          { playerId: actor.id, unitId, ownerId: matchingUnits[0].ownerId },
        ),
      };
    }

    reserveSet.add(unitId);
  }

  return { ok: true, value: reserveSet };
};

const validateInitialPlacementDestinations = (
  input: ApplySubmitInitialPlacementActionInput,
  actor: MatchPlayerState,
): Result<true, RuleError> => {
  const placementAreaKeys = new Set(
    getInitialPlacementCoordinates(
      actor.side,
      input.state.boardSize,
      input.config.initialPlacementDepth,
    ).map(coordinateKey),
  );
  const destinationKeys = new Set<string>();

  for (const placement of input.action.placements) {
    const destination = placement.position;
    const key = coordinateKey(destination);

    if (destinationKeys.has(key)) {
      return {
        ok: false,
        error: makeRuleError(
          "DUPLICATE_INITIAL_PLACEMENT_DESTINATION",
          "Initial placement destinations must be unique.",
          { destination },
        ),
      };
    }
    destinationKeys.add(key);

    if (!isInsideBoard(destination, input.state.boardSize)) {
      return {
        ok: false,
        error: makeRuleError(
          "INVALID_INITIAL_PLACEMENT_DESTINATION",
          "Initial placement destination must be inside the board.",
          { destination, boardSize: input.state.boardSize },
        ),
      };
    }

    if (
      !isCoordinateInInitialPlacementArea(
        destination,
        actor.side,
        input.state.boardSize,
        input.config.initialPlacementDepth,
      ) ||
      !placementAreaKeys.has(key)
    ) {
      return {
        ok: false,
        error: makeRuleError(
          "INVALID_INITIAL_PLACEMENT_DESTINATION",
          "Initial placement destination must be in the actor initial placement area.",
          { destination, side: actor.side },
        ),
      };
    }

    const flagResult = isCoordinateInFlagArea({
      coordinate: destination,
      side: actor.side,
      boardSize: input.state.boardSize,
    });

    if (!flagResult.ok) {
      return flagResult;
    }

    if (flagResult.value) {
      return {
        ok: false,
        error: makeRuleError(
          "INITIAL_PLACEMENT_DESTINATION_IS_FLAG",
          "Initial placement destination must not be in the flag area.",
          { destination, side: actor.side },
        ),
      };
    }

    const occupant = getUnitAtCoordinate(input.state.units, destination);
    if (occupant !== null) {
      return {
        ok: false,
        error: makeRuleError(
          "INITIAL_PLACEMENT_DESTINATION_OCCUPIED",
          "Initial placement destination must be empty.",
          { destination, occupantUnitId: occupant.id },
        ),
      };
    }
  }

  return { ok: true, value: true };
};

const validateSubmitInitialPlacementAction = (
  input: ApplySubmitInitialPlacementActionInput,
): Result<ValidatedSubmitInitialPlacementInput, RuleError> => {
  const setupResult = validateSetupAction(input);
  if (!setupResult.ok) {
    return setupResult;
  }

  const uniqueUnitsResult = validateUniqueUnitIds(input.state.units);
  if (!uniqueUnitsResult.ok) {
    return uniqueUnitsResult;
  }

  const actor = setupResult.value;
  const reserveResult = validateReserveUnitIds(
    actor,
    input.state.units,
    input.config,
  );
  if (!reserveResult.ok) {
    return reserveResult;
  }
  const reserveUnitIds = reserveResult.value;

  if (input.action.placements.length !== input.config.initialUnitCount) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_INITIAL_PLACEMENT_COUNT",
        "Initial placement must submit exactly the configured initial unit count.",
        {
          placementCount: input.action.placements.length,
          expectedPlacementCount: input.config.initialUnitCount,
        },
      ),
    };
  }

  const placementUnitIds = new Set<UnitId>();
  for (const placement of input.action.placements) {
    if (placementUnitIds.has(placement.unitId)) {
      return {
        ok: false,
        error: makeRuleError(
          "DUPLICATE_INITIAL_PLACEMENT_UNIT",
          "Initial placement unit ids must be unique.",
          { unitId: placement.unitId },
        ),
      };
    }
    placementUnitIds.add(placement.unitId);

    if (!isValidStance(placement.stance)) {
      return {
        ok: false,
        error: makeRuleError(
          "INVALID_ACTION",
          "Initial placement stance must be valid.",
          {
            unitId: placement.unitId,
            stance: placement.stance,
          },
        ),
      };
    }
  }

  const destinationResult = validateInitialPlacementDestinations(input, actor);
  if (!destinationResult.ok) {
    return destinationResult;
  }

  const ownedUnits = input.state.units.filter(
    (unit) => unit.ownerId === actor.id,
  );
  const initialUnits = ownedUnits.filter(
    (unit) => !reserveUnitIds.has(unit.id),
  );

  if (initialUnits.length !== input.config.initialUnitCount) {
    return {
      ok: false,
      error: makeRuleError(
        "INITIAL_PLACEMENT_UNIT_MISMATCH",
        "Owned non-reserve units must exactly match the configured initial unit count.",
        {
          playerId: actor.id,
          initialUnitCount: initialUnits.length,
          expectedInitialUnitCount: input.config.initialUnitCount,
        },
      ),
    };
  }

  for (const placement of input.action.placements) {
    const targetUnits = findUnitsById(input.state.units, placement.unitId);
    if (targetUnits.length === 0) {
      return {
        ok: false,
        error: makeRuleError(
          "INITIAL_PLACEMENT_UNIT_MISMATCH",
          "Initial placement unit must exist.",
          { unitId: placement.unitId },
        ),
      };
    }

    if (targetUnits.length > 1) {
      return {
        ok: false,
        error: makeRuleError("DUPLICATE_UNIT", "Unit ids must be unique.", {
          unitId: placement.unitId,
        }),
      };
    }

    const unit = targetUnits[0];
    if (unit.ownerId !== actor.id) {
      return {
        ok: false,
        error: makeRuleError(
          "INITIAL_PLACEMENT_OWNER_MISMATCH",
          "Initial placement unit must be owned by the actor.",
          { unitId: unit.id, ownerId: unit.ownerId, actorId: actor.id },
        ),
      };
    }

    if (reserveUnitIds.has(unit.id)) {
      return {
        ok: false,
        error: makeRuleError(
          "INITIAL_PLACEMENT_INCLUDES_RESERVE",
          "Reserve units cannot be included in initial placement.",
          { unitId: unit.id },
        ),
      };
    }

    if (!initialUnits.some((initialUnit) => initialUnit.id === unit.id)) {
      return {
        ok: false,
        error: makeRuleError(
          "INITIAL_PLACEMENT_UNIT_MISMATCH",
          "Submitted unit must be one of the actor initial placement units.",
          { unitId: unit.id },
        ),
      };
    }

    if (unit.status !== "reserve") {
      return {
        ok: false,
        error: makeRuleError(
          "UNIT_NOT_IN_RESERVE",
          "Initial placement units must start in reserve status.",
          { unitId: unit.id, status: unit.status },
        ),
      };
    }

    if (unit.position !== null) {
      return {
        ok: false,
        error: makeRuleError(
          "UNIT_NOT_IN_RESERVE",
          "Initial placement reserve units must not already have a position.",
          { unitId: unit.id, position: unit.position },
        ),
      };
    }

    if (!Number.isFinite(unit.card.baseDefense) || unit.card.baseDefense <= 0) {
      return {
        ok: false,
        error: makeRuleError(
          "INVALID_UNIT_BASE_DEFENSE",
          "Initial placement unit baseDefense must be a positive finite number.",
          { unitId: unit.id, baseDefense: unit.card.baseDefense },
        ),
      };
    }
  }

  for (const initialUnit of initialUnits) {
    if (!placementUnitIds.has(initialUnit.id)) {
      return {
        ok: false,
        error: makeRuleError(
          "INITIAL_PLACEMENT_UNIT_MISMATCH",
          "Submitted units must exactly match all actor initial placement units.",
          { missingUnitId: initialUnit.id },
        ),
      };
    }
  }

  return { ok: true, value: { actor, placementUnits: initialUnits } };
};

const isDestinationFlagArea = (
  state: MatchState,
  destination: Coordinate,
): Result<boolean, RuleError> => {
  for (const player of state.players) {
    const result = isCoordinateInFlagArea({
      coordinate: destination,
      side: player.side,
      boardSize: state.boardSize,
    });

    if (!result.ok) {
      return result;
    }

    if (result.value) {
      return { ok: true, value: true };
    }
  }

  return { ok: true, value: false };
};

const findLegalMove = (
  moves: readonly LegalMove[],
  destination: Coordinate,
): LegalMove | null =>
  moves.find((move) => areCoordinatesEqual(move.destination, destination)) ??
  null;

const replaceUnits = (
  units: readonly UnitState[],
  replacements: readonly UnitState[],
): UnitState[] => {
  const replacementsById = new Map<UnitId, UnitState>(
    replacements.map((unit) => [unit.id, unit]),
  );

  return units.map((unit) => replacementsById.get(unit.id) ?? unit);
};

const replacePlayer = (
  players: readonly MatchPlayerState[],
  replacement: MatchPlayerState,
): MatchPlayerState[] =>
  players.map((player) =>
    player.id === replacement.id ? replacement : player,
  );

const getEnemyAtDestination = (
  units: readonly UnitState[],
  actorId: MatchPlayerId,
  destination: Coordinate,
): Result<UnitState, RuleError> => {
  const occupants = units.filter(
    (unit) =>
      unit.status === "board" &&
      unit.position !== null &&
      areCoordinatesEqual(unit.position, destination),
  );

  if (occupants.length !== 1) {
    return {
      ok: false,
      error: makeRuleError(
        "DESTINATION_STATE_INVALID",
        "Engage destination must contain exactly one unit.",
        { destination, occupantCount: occupants.length },
      ),
    };
  }

  const defender = occupants[0];
  if (defender.ownerId === actorId) {
    return {
      ok: false,
      error: makeRuleError(
        "DESTINATION_STATE_INVALID",
        "Engage destination must contain an enemy unit.",
        { destination, unitId: defender.id },
      ),
    };
  }

  return { ok: true, value: defender };
};

const createUnitMovedEvent = (
  unit: UnitState,
  from: Coordinate,
  to: Coordinate,
  stance: Stance,
): GameEventPayload => ({
  type: "UNIT_MOVED",
  unitId: unit.id,
  ownerId: unit.ownerId,
  from,
  to,
  stance,
});

const createFlagAttackedEvent = (
  action: AttackFlagAction,
  defenderPlayerId: MatchPlayerId,
): GameEventPayload => ({
  type: "FLAG_ATTACKED",
  attackerUnitId: action.unitId,
  attackerPlayerId: action.actorId,
  defenderPlayerId,
  target: cloneCoordinate(action.target),
});

const finalizeSuccessfulAction = (
  state: MatchState,
  events: readonly GameEventPayload[],
): Result<TacticalDuelActionResult, RuleError> => {
  const victoryResult = evaluateTacticalDuelVictory({
    players: state.players,
    units: state.units,
  });

  if (!victoryResult.ok) {
    return victoryResult;
  }

  if (victoryResult.value.finished) {
    return {
      ok: true,
      value: {
        state: {
          ...state,
          phase: "finished",
          winnerPlayerId: victoryResult.value.winnerPlayerId,
          winReason: victoryResult.value.reason,
          currentTurnPlayerId: null,
          stateVersion: state.stateVersion + 1,
        },
        events: [...events, ...victoryResult.value.events],
      },
    };
  }

  const turnResult = advanceTurn(state);
  if (!turnResult.ok) {
    return turnResult;
  }

  return {
    ok: true,
    value: {
      state: {
        ...turnResult.value.state,
        stateVersion: state.stateVersion + 1,
      },
      events: [...events, turnResult.value.event],
    },
  };
};

const applyNormalMove = ({
  state,
  action,
  config,
  validated,
}: ApplyMoveUnitActionInput & {
  validated: ValidatedMoveInput;
}): Result<TacticalDuelActionResult, RuleError> => {
  const movedUnit: UnitState = {
    ...validated.unit,
    position: cloneCoordinate(action.destination),
    stance: action.nextStance,
  };

  const revealResult = applyRevealOnMoveConfirmed({
    unit: movedUnit,
    opponentId: validated.opponentId,
    visibilities: state.unitVisibilities,
    config,
  });

  if (!revealResult.ok) {
    return revealResult;
  }

  const nextState: MatchState = {
    ...state,
    units: replaceUnits(state.units, [movedUnit]),
    unitVisibilities: [...revealResult.value.visibilities],
  };

  return finalizeSuccessfulAction(nextState, [
    ...revealResult.value.events,
    createUnitMovedEvent(
      validated.unit,
      validated.origin,
      cloneCoordinate(action.destination),
      action.nextStance,
    ),
  ]);
};

const applyCombatMove = ({
  state,
  action,
  config,
  validated,
}: ApplyMoveUnitActionInput & {
  validated: ValidatedMoveInput;
}): Result<TacticalDuelActionResult, RuleError> => {
  const defenderResult = getEnemyAtDestination(
    state.units,
    action.actorId,
    action.destination,
  );

  if (!defenderResult.ok) {
    return defenderResult;
  }

  const attackerRevealResult = applyRevealOnMoveConfirmed({
    unit: validated.unit,
    opponentId: validated.opponentId,
    visibilities: state.unitVisibilities,
    config,
  });

  if (!attackerRevealResult.ok) {
    return attackerRevealResult;
  }

  const defenderRevealResult = applyRevealWhenAttacked({
    defender: defenderResult.value,
    attackerOwnerId: action.actorId,
    visibilities: attackerRevealResult.value.visibilities,
    config,
  });

  if (!defenderRevealResult.ok) {
    return defenderRevealResult;
  }

  const combatResult = resolveCombat({
    attacker: validated.unit,
    defender: defenderResult.value,
    attackerOrigin: validated.origin,
    destination: action.destination,
    config,
  });

  if (!combatResult.ok) {
    return combatResult;
  }

  const nextAttacker: UnitState =
    combatResult.value.attacker.status === "board"
      ? { ...combatResult.value.attacker, stance: action.nextStance }
      : combatResult.value.attacker;

  const nextState: MatchState = {
    ...state,
    units: replaceUnits(state.units, [
      nextAttacker,
      combatResult.value.defender,
    ]),
    unitVisibilities: [...defenderRevealResult.value.visibilities],
  };

  return finalizeSuccessfulAction(nextState, [
    ...attackerRevealResult.value.events,
    ...defenderRevealResult.value.events,
    ...combatResult.value.events,
  ]);
};

export const applyMoveUnitAction = (
  input: ApplyMoveUnitActionInput,
): Result<TacticalDuelActionResult, RuleError> => {
  const validationResult = validateMoveAction(input);

  if (!validationResult.ok) {
    return validationResult;
  }

  const flagAreaResult = isDestinationFlagArea(
    input.state,
    input.action.destination,
  );

  if (!flagAreaResult.ok) {
    return flagAreaResult;
  }

  if (flagAreaResult.value) {
    return {
      ok: false,
      error: makeRuleError(
        "FLAG_AREA_REQUIRES_FLAG_ACTION",
        "Flag area destinations require a dedicated flag action.",
        { destination: input.action.destination },
      ),
    };
  }

  void validationResult.value.unit.card.movementType;
  const legalMovesResult = calculateLegalMoves({
    unit: validationResult.value.unit,
    units: input.state.units,
    boardSize: input.state.boardSize,
    movementRule: validationResult.value.unit.card.movementRule,
    config: input.config,
  });

  if (!legalMovesResult.ok) {
    return legalMovesResult;
  }

  const legalMove = findLegalMove(
    legalMovesResult.value,
    input.action.destination,
  );

  if (legalMove === null) {
    return {
      ok: false,
      error: makeRuleError(
        "DESTINATION_NOT_LEGAL",
        "Destination is not in the unit legal moves.",
        { unitId: input.action.unitId, destination: input.action.destination },
      ),
    };
  }

  if (legalMove.kind === "move") {
    return applyNormalMove({ ...input, validated: validationResult.value });
  }

  return applyCombatMove({ ...input, validated: validationResult.value });
};

export const applyAttackFlagAction = (
  input: ApplyAttackFlagActionInput,
): Result<TacticalDuelActionResult, RuleError> => {
  const validationResult = validateAttackFlagAction(input);

  if (!validationResult.ok) {
    return validationResult;
  }

  const legalMovesResult = calculateLegalMoves({
    unit: validationResult.value.unit,
    units: input.state.units,
    boardSize: input.state.boardSize,
    movementRule: validationResult.value.unit.card.movementRule,
    config: input.config,
  });

  if (!legalMovesResult.ok) {
    return legalMovesResult;
  }

  const legalMove = findLegalMove(legalMovesResult.value, input.action.target);

  if (legalMove === null || legalMove.kind !== "move") {
    return {
      ok: false,
      error: makeRuleError(
        "FLAG_ATTACK_NOT_LEGAL",
        "Flag attack target is not reachable by the unit movement rule.",
        { unitId: input.action.unitId, target: input.action.target },
      ),
    };
  }

  const revealResult = applyRevealOnMoveConfirmed({
    unit: validationResult.value.unit,
    opponentId: validationResult.value.opponentId,
    visibilities: input.state.unitVisibilities,
    config: input.config,
  });

  if (!revealResult.ok) {
    return revealResult;
  }

  const flagDamageResult = applyFlagDamage({
    flag: validationResult.value.defender.flag,
    amount: 1,
  });

  if (!flagDamageResult.ok) {
    return flagDamageResult;
  }

  if (flagDamageResult.value.appliedDamage !== 1) {
    return {
      ok: false,
      error: makeRuleError(
        "FLAG_ALREADY_DESTROYED",
        "A successful flag attack must apply exactly one damage.",
        {
          defenderPlayerId: validationResult.value.defender.id,
          appliedDamage: flagDamageResult.value.appliedDamage,
        },
      ),
    };
  }

  const nextUnit: UnitState = {
    ...validationResult.value.unit,
    stance: input.action.nextStance,
  };
  const nextDefender: MatchPlayerState = {
    ...validationResult.value.defender,
    flag: flagDamageResult.value.flag,
  };
  const nextState: MatchState = {
    ...input.state,
    players: replacePlayer(input.state.players, nextDefender),
    units: replaceUnits(input.state.units, [nextUnit]),
    unitVisibilities: [...revealResult.value.visibilities],
  };

  return finalizeSuccessfulAction(nextState, [
    ...revealResult.value.events,
    createFlagAttackedEvent(input.action, validationResult.value.defender.id),
    ...flagDamageResult.value.events,
  ]);
};

export const applyDeployReserveAction = (
  input: ApplyDeployReserveActionInput,
): Result<TacticalDuelActionResult, RuleError> => {
  const validationResult = validateDeployReserveAction(input);

  if (!validationResult.ok) {
    return validationResult;
  }

  const deploymentResult = deployReserveUnit({
    player: validationResult.value.actor,
    unit: validationResult.value.unit,
    units: input.state.units,
    destination: input.action.destination,
    stance: input.action.stance,
    boardSize: input.state.boardSize,
    config: input.config,
  });

  if (!deploymentResult.ok) {
    return deploymentResult;
  }

  const nextState: MatchState = {
    ...input.state,
    units: replaceUnits(input.state.units, [deploymentResult.value.unit]),
    unitVisibilities: input.state.unitVisibilities,
  };

  return finalizeSuccessfulAction(nextState, deploymentResult.value.events);
};

const validateConcedeMatchAction = (
  input: ApplyConcedeMatchActionInput,
): Result<ValidatedCommonActionInput, RuleError> =>
  validateCommonAction({
    state: input.state,
    action: input.action,
    requireCurrentTurnActor: false,
  });

export const applyConcedeMatchAction = (
  input: ApplyConcedeMatchActionInput,
): Result<TacticalDuelActionResult, RuleError> => {
  void input.config;

  const validationResult = validateConcedeMatchAction(input);
  if (!validationResult.ok) {
    return validationResult;
  }

  const winnerPlayerId = validationResult.value.opponentId;
  const loserPlayerId = input.action.actorId;

  return {
    ok: true,
    value: {
      state: {
        ...input.state,
        phase: "finished",
        currentTurnPlayerId: null,
        winnerPlayerId,
        winReason: "concession",
        stateVersion: input.state.stateVersion + 1,
      },
      events: [
        {
          type: "MATCH_CONCEDED",
          concedingPlayerId: loserPlayerId,
          winnerPlayerId,
        },
        {
          type: "MATCH_FINISHED",
          winnerPlayerId,
          loserPlayerId,
          reason: "concession",
        },
      ],
    },
  };
};

export const applySubmitInitialPlacementAction = (
  input: ApplySubmitInitialPlacementActionInput,
): Result<TacticalDuelActionResult, RuleError> => {
  const validationResult = validateSubmitInitialPlacementAction(input);

  if (!validationResult.ok) {
    return validationResult;
  }

  const placementsByUnitId = new Map(
    input.action.placements.map((placement) => [placement.unitId, placement]),
  );
  const placementUnitIds = new Set(
    validationResult.value.placementUnits.map((unit) => unit.id),
  );
  const nextUnits = input.state.units.map((unit) => {
    if (!placementUnitIds.has(unit.id)) {
      return unit;
    }

    const placement = placementsByUnitId.get(unit.id);
    if (placement === undefined) {
      return unit;
    }

    return {
      ...unit,
      status: "board" as const,
      position: cloneCoordinate(placement.position),
      stance: placement.stance,
      currentDefense: unit.card.baseDefense,
    };
  });

  const nextState: MatchState = {
    ...input.state,
    players: input.state.players.map((player) =>
      player.id === input.action.actorId
        ? { ...player, setupSubmitted: true }
        : player,
    ),
    units: nextUnits,
    unitVisibilities: input.state.unitVisibilities,
    stateVersion: input.state.stateVersion + 1,
  };

  return {
    ok: true,
    value: {
      state: nextState,
      events: [
        {
          type: "INITIAL_PLACEMENT_SUBMITTED",
          playerId: input.action.actorId,
          unitCount: input.action.placements.length,
        },
      ],
    },
  };
};

export const applyTacticalDuelAction = (
  input: ApplyTacticalDuelActionInput,
): Result<TacticalDuelActionResult, RuleError> => {
  switch (input.action.type) {
    case "MOVE_UNIT":
      return applyMoveUnitAction({
        state: input.state,
        action: input.action,
        config: input.config,
      });
    case "ATTACK_FLAG":
      return applyAttackFlagAction({
        state: input.state,
        action: input.action,
        config: input.config,
      });
    case "DEPLOY_RESERVE":
      return applyDeployReserveAction({
        state: input.state,
        action: input.action,
        config: input.config,
      });
    case "SUBMIT_INITIAL_PLACEMENT":
      return applySubmitInitialPlacementAction({
        state: input.state,
        action: input.action,
        config: input.config,
      });
    case "CONCEDE_MATCH":
      return applyConcedeMatchAction({
        state: input.state,
        action: input.action,
        config: input.config,
      });
    default:
      return {
        ok: false,
        error: makeRuleError(
          "UNSUPPORTED_ACTION",
          "Action is not supported by the tactical_duel reducer.",
          { actionType: input.action.type },
        ),
      };
  }
};
