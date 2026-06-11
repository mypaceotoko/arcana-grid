import { toRulesVersion } from "../../core";
import type { TacticalRuleConfig } from "./types";

export const TACTICAL_DUEL_RULES_VERSION = toRulesVersion("tactical_duel.v1");

export const TACTICAL_DUEL_RULE_CONFIG: TacticalRuleConfig = {
  gameMode: "tactical_duel",
  rulesVersion: TACTICAL_DUEL_RULES_VERSION,
  boardWidth: 8,
  boardHeight: 8,
  initialUnitCount: 6,
  reserveUnitCount: 2,
  flagMaxDamage: 3,
  sameCharacterLimit: 1,
  friendlyPassThrough: true,
  friendlyStopAllowed: false,
  enemyPassThrough: false,
  revealOnFirstMove: true,
  revealWhenAttacked: true,
  keepRevealedUntilMatchEnd: true,
  clampCurrentDefenseToZero: true,
};
