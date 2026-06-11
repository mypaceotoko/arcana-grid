import type { MatchPlayerId, MatchState } from "../../core";
import type { TacticalDuelActionResult } from "./reducer-types";
import type { TacticalRuleConfig } from "./types";

export type StartTacticalDuelMatchInput = {
  readonly state: MatchState;
  readonly firstPlayerId: MatchPlayerId;
  readonly expectedStateVersion: number;
  readonly config: TacticalRuleConfig;
};

export type StartTacticalDuelMatchResult = TacticalDuelActionResult;
