import type {
  GameEventPayload,
  MatchPlayerId,
  MatchPlayerState,
  Result,
  RuleError,
  UnitState,
  WinReason,
} from "../../core";

export type TacticalDuelVictoryReason = Extract<
  WinReason,
  "flag_destroyed" | "annihilation"
>;

export type VictoryResult = {
  finished: true;
  winnerPlayerId: MatchPlayerId;
  loserPlayerId: MatchPlayerId;
  reason: TacticalDuelVictoryReason;
  events: readonly GameEventPayload[];
};

export type VictoryEvaluation =
  | {
      finished: false;
      events: readonly GameEventPayload[];
    }
  | VictoryResult;

export type IsPlayerAnnihilatedInput = {
  playerId: MatchPlayerId;
  units: readonly UnitState[];
};

export type EvaluateTacticalDuelVictoryInput = {
  players: readonly MatchPlayerState[];
  units: readonly UnitState[];
};

export type VictoryEvaluationResult = Result<VictoryEvaluation, RuleError>;
