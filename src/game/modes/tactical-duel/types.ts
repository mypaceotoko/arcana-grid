import type { RulesVersion } from "../../core";

export type TacticalRuleConfig = {
  gameMode: "tactical_duel";
  rulesVersion: RulesVersion;
  boardWidth: number;
  boardHeight: number;
  initialUnitCount: number;
  reserveUnitCount: number;
  initialPlacementDepth: number;
  flagMaxDamage: number;
  sameCharacterLimit: number;
  friendlyPassThrough: boolean;
  friendlyStopAllowed: boolean;
  enemyPassThrough: boolean;
  revealOnFirstMove: boolean;
  revealWhenAttacked: boolean;
  keepRevealedUntilMatchEnd: boolean;
  clampCurrentDefenseToZero: boolean;
};
