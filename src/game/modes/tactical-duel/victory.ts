import type {
  GameEventPayload,
  MatchPlayerId,
  MatchPlayerState,
  Result,
  RuleError,
  UnitState,
} from "../../core";
import { isFlagAtMaximumDamage, validateFlagState } from "./flag";
import type {
  EvaluateTacticalDuelVictoryInput,
  IsPlayerAnnihilatedInput,
  TacticalDuelVictoryReason,
  VictoryEvaluation,
  VictoryEvaluationResult,
  VictoryResult,
} from "./victory-types";

type DefeatCandidate = {
  loserPlayerId: MatchPlayerId;
  winnerPlayerId: MatchPlayerId;
  reason: TacticalDuelVictoryReason;
};

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

export const getPlayerUnits = (
  units: readonly UnitState[],
  playerId: MatchPlayerId,
): readonly UnitState[] =>
  units
    .filter((unit) => unit.ownerId === playerId)
    .sort((left, right) => compareText(left.id, right.id));

export const isPlayerAnnihilated = ({
  playerId,
  units,
}: IsPlayerAnnihilatedInput): Result<boolean, RuleError> => {
  const playerUnits = getPlayerUnits(units, playerId);

  if (playerUnits.length === 0) {
    return {
      ok: false,
      error: makeRuleError(
        "PLAYER_HAS_NO_UNITS",
        "A player must own at least one unit before annihilation can be evaluated.",
        { playerId },
      ),
    };
  }

  return {
    ok: true,
    value: playerUnits.every((unit) => unit.status === "defeated"),
  };
};

export const isPlayerFlagDestroyed = (
  player: MatchPlayerState,
): Result<boolean, RuleError> => {
  if (player.flag.ownerId !== player.id) {
    return {
      ok: false,
      error: makeRuleError(
        "FLAG_OWNER_MISMATCH",
        "A player flag owner must match the player id.",
        { playerId: player.id, flagOwnerId: player.flag.ownerId },
      ),
    };
  }

  return isFlagAtMaximumDamage(player.flag);
};

const createMatchFinishedEvent = (
  candidate: DefeatCandidate,
): GameEventPayload => ({
  type: "MATCH_FINISHED",
  winnerPlayerId: candidate.winnerPlayerId,
  loserPlayerId: candidate.loserPlayerId,
  reason: candidate.reason,
});

const validatePlayers = (
  players: readonly MatchPlayerState[],
): Result<readonly MatchPlayerState[], RuleError> => {
  if (players.length !== 2) {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_PLAYER_COUNT",
        "Tactical duel victory evaluation requires exactly two players.",
        { playerCount: players.length },
      ),
    };
  }

  const playerIds = new Set<MatchPlayerId>();

  for (const player of players) {
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

    if (player.flag.ownerId !== player.id) {
      return {
        ok: false,
        error: makeRuleError(
          "FLAG_OWNER_MISMATCH",
          "A player flag owner must match the player id.",
          { playerId: player.id, flagOwnerId: player.flag.ownerId },
        ),
      };
    }

    const flagResult = validateFlagState(player.flag);

    if (!flagResult.ok) {
      return flagResult;
    }
  }

  return {
    ok: true,
    value: [...players].sort((left, right) => compareText(left.id, right.id)),
  };
};

const validateUnits = (
  players: readonly MatchPlayerState[],
  units: readonly UnitState[],
): Result<void, RuleError> => {
  const playerIds = new Set(players.map((player) => player.id));
  const unitIds = new Set<UnitState["id"]>();

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

    if (!playerIds.has(unit.ownerId)) {
      return {
        ok: false,
        error: makeRuleError(
          "UNKNOWN_UNIT_OWNER",
          "Every unit owner must be one of the match players.",
          { unitId: unit.id, ownerId: unit.ownerId },
        ),
      };
    }
  }

  for (const player of players) {
    if (getPlayerUnits(units, player.id).length === 0) {
      return {
        ok: false,
        error: makeRuleError(
          "PLAYER_HAS_NO_UNITS",
          "Every match player must own at least one unit.",
          { playerId: player.id },
        ),
      };
    }
  }

  return { ok: true, value: undefined };
};

const getOpponent = (
  players: readonly MatchPlayerState[],
  player: MatchPlayerState,
): MatchPlayerState => {
  const opponent = players.find((candidate) => candidate.id !== player.id);

  if (opponent === undefined) {
    return player;
  }

  return opponent;
};

const getDefeatCandidate = (
  player: MatchPlayerState,
  opponent: MatchPlayerState,
  units: readonly UnitState[],
): Result<DefeatCandidate | null, RuleError> => {
  const flagDestroyedResult = isPlayerFlagDestroyed(player);

  if (!flagDestroyedResult.ok) {
    return flagDestroyedResult;
  }

  const annihilatedResult = isPlayerAnnihilated({
    playerId: player.id,
    units,
  });

  if (!annihilatedResult.ok) {
    return annihilatedResult;
  }

  if (flagDestroyedResult.value) {
    return {
      ok: true,
      value: {
        loserPlayerId: player.id,
        winnerPlayerId: opponent.id,
        reason: "flag_destroyed",
      },
    };
  }

  if (annihilatedResult.value) {
    return {
      ok: true,
      value: {
        loserPlayerId: player.id,
        winnerPlayerId: opponent.id,
        reason: "annihilation",
      },
    };
  }

  return { ok: true, value: null };
};

export const evaluateTacticalDuelVictory = ({
  players,
  units,
}: EvaluateTacticalDuelVictoryInput): VictoryEvaluationResult => {
  const playersResult = validatePlayers(players);

  if (!playersResult.ok) {
    return playersResult;
  }

  const sortedPlayers = playersResult.value;
  const unitsResult = validateUnits(sortedPlayers, units);

  if (!unitsResult.ok) {
    return unitsResult;
  }

  const candidates: DefeatCandidate[] = [];

  for (const player of sortedPlayers) {
    const opponent = getOpponent(sortedPlayers, player);
    const candidateResult = getDefeatCandidate(player, opponent, units);

    if (!candidateResult.ok) {
      return candidateResult;
    }

    if (candidateResult.value !== null) {
      candidates.push(candidateResult.value);
    }
  }

  if (candidates.length > 1) {
    return {
      ok: false,
      error: makeRuleError(
        "AMBIGUOUS_VICTORY_STATE",
        "Both players satisfy defeat conditions, so a winner cannot be inferred.",
        { loserPlayerIds: candidates.map((candidate) => candidate.loserPlayerId) },
      ),
    };
  }

  if (candidates.length === 0) {
    const evaluation: VictoryEvaluation = { finished: false, events: [] };

    return { ok: true, value: evaluation };
  }

  const candidate = candidates[0];
  const result: VictoryResult = {
    finished: true,
    winnerPlayerId: candidate.winnerPlayerId,
    loserPlayerId: candidate.loserPlayerId,
    reason: candidate.reason,
    events: [createMatchFinishedEvent(candidate)],
  };

  return { ok: true, value: result };
};
