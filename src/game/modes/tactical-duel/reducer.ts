import type {
  Coordinate,
  GameAction,
  GameEventPayload,
  MatchPlayerId,
  MatchState,
  MoveUnitAction,
  Result,
  RuleError,
  Stance,
  UnitId,
  UnitState,
} from "../../core";
import { areCoordinatesEqual, isInsideBoard } from "../../core";
import { resolveCombat } from "./combat";
import { isCoordinateInFlagArea } from "./flag";
import { calculateLegalMoves, type LegalMove } from "./movement";
import type { TacticalRuleConfig } from "./types";
import { evaluateTacticalDuelVictory } from "./victory";
import {
  applyRevealOnMoveConfirmed,
  applyRevealWhenAttacked,
} from "./visibility";
import type { TacticalDuelActionResult } from "./reducer-types";
import { advanceTurn, getOpponentPlayerId } from "./turn";

type ApplyMoveUnitActionInput = {
  state: MatchState;
  action: MoveUnitAction;
  config: TacticalRuleConfig;
};

type ApplyTacticalDuelActionInput = {
  state: MatchState;
  action: GameAction;
  config: TacticalRuleConfig;
};

type ValidatedMoveInput = {
  opponentId: MatchPlayerId;
  unit: UnitState;
  origin: Coordinate;
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
  action: MoveUnitAction,
): Result<MatchPlayerId, RuleError> => {
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

  if (!playerIds.has(action.actorId)) {
    return {
      ok: false,
      error: makeRuleError(
        "NOT_YOUR_TURN",
        "Actor must be one of the match players.",
        { actorId: action.actorId },
      ),
    };
  }

  return getOpponentPlayerId(state.players, action.actorId);
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

const validateMoveAction = ({
  state,
  action,
}: ApplyMoveUnitActionInput): Result<ValidatedMoveInput, RuleError> => {
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
        "MOVE_UNIT is only supported for tactical_duel matches.",
        { gameMode: state.gameMode },
      ),
    };
  }

  if (state.phase === "finished" || state.winnerPlayerId !== null) {
    return {
      ok: false,
      error: makeRuleError("MATCH_FINISHED", "Finished matches cannot move units.", {
        phase: state.phase,
        winnerPlayerId: state.winnerPlayerId,
      }),
    };
  }

  if (state.phase !== "active") {
    return {
      ok: false,
      error: makeRuleError("INVALID_PHASE", "MOVE_UNIT requires active phase.", {
        phase: state.phase,
      }),
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

  if (state.currentTurnPlayerId !== action.actorId) {
    return {
      ok: false,
      error: makeRuleError("NOT_YOUR_TURN", "Actor is not the current turn player.", {
        actorId: action.actorId,
        currentTurnPlayerId: state.currentTurnPlayerId,
      }),
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

  const opponentResult = validatePlayers(state, action);
  if (!opponentResult.ok) {
    return opponentResult;
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
      error: makeRuleError("UNIT_NOT_ON_BOARD", "Board units must have a position.", {
        unitId: unit.id,
      }),
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
      error: makeRuleError("INVALID_ACTION", "nextStance must be attack or defense.", {
        nextStance: action.nextStance,
      }),
    };
  }

  return {
    ok: true,
    value: {
      opponentId: opponentResult.value,
      unit,
      origin: cloneCoordinate(unit.position),
    },
  };
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
  moves.find((move) => areCoordinatesEqual(move.destination, destination)) ?? null;

const replaceUnits = (
  units: readonly UnitState[],
  replacements: readonly UnitState[],
): UnitState[] => {
  const replacementsById = new Map<UnitId, UnitState>(
    replacements.map((unit) => [unit.id, unit]),
  );

  return units.map((unit) => replacementsById.get(unit.id) ?? unit);
};

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
    units: replaceUnits(state.units, [nextAttacker, combatResult.value.defender]),
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

  const flagAreaResult = isDestinationFlagArea(input.state, input.action.destination);

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

export const applyTacticalDuelAction = (
  input: ApplyTacticalDuelActionInput,
): Result<TacticalDuelActionResult, RuleError> => {
  if (input.action.type !== "MOVE_UNIT") {
    return {
      ok: false,
      error: makeRuleError(
        "UNSUPPORTED_ACTION",
        "Only MOVE_UNIT is supported by this reducer task.",
        { actionType: input.action.type },
      ),
    };
  }

  return applyMoveUnitAction({
    state: input.state,
    action: input.action,
    config: input.config,
  });
};
