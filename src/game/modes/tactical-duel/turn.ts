import type {
  GameEventPayload,
  MatchPlayerId,
  MatchPlayerState,
  MatchState,
  Result,
  RuleError,
} from "../../core";

type TurnAdvanceResult = {
  state: MatchState;
  event: GameEventPayload;
};

const makeRuleError = (
  code: RuleError["code"],
  message: string,
  details?: Record<string, unknown>,
): RuleError => ({ code, message, details });

export const getOpponentPlayerId = (
  players: readonly MatchPlayerState[],
  currentPlayerId: MatchPlayerId,
): Result<MatchPlayerId, RuleError> => {
  if (players.length !== 2) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_PLAYER_COUNT",
        "Tactical duel turn advancement requires exactly two players.",
        { playerCount: players.length },
      ),
    };
  }

  const opponentIds = players
    .filter((player) => player.id !== currentPlayerId)
    .map((player) => player.id);

  if (opponentIds.length !== 1) {
    return {
      ok: false,
      error: makeRuleError(
        "CURRENT_TURN_PLAYER_MISSING",
        "Current turn player must be one of the match players.",
        { currentPlayerId },
      ),
    };
  }

  return { ok: true, value: opponentIds[0] };
};

export const advanceTurn = (state: MatchState): Result<TurnAdvanceResult, RuleError> => {
  if (state.currentTurnPlayerId === null) {
    return {
      ok: false,
      error: makeRuleError(
        "CURRENT_TURN_PLAYER_MISSING",
        "Cannot advance a turn when currentTurnPlayerId is null.",
      ),
    };
  }

  const opponentResult = getOpponentPlayerId(
    state.players,
    state.currentTurnPlayerId,
  );

  if (!opponentResult.ok) {
    return opponentResult;
  }

  const turnNumber = state.turnNumber + 1;
  const event: GameEventPayload = {
    type: "TURN_CHANGED",
    previousPlayerId: state.currentTurnPlayerId,
    nextPlayerId: opponentResult.value,
    turnNumber,
  };

  return {
    ok: true,
    value: {
      state: {
        ...state,
        currentTurnPlayerId: opponentResult.value,
        turnNumber,
      },
      event,
    },
  };
};
