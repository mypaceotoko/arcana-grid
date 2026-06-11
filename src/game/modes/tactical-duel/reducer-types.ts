import type { GameEventPayload, MatchState } from "../../core";

export type TacticalDuelActionResult = {
  state: MatchState;
  events: readonly GameEventPayload[];
};
