import type {
  GameEventPayload,
  MatchPlayerId,
  Result,
  RuleError,
  RevealReason,
  UnitState,
  UnitVisibility,
  VisibilityLevel,
} from "../../core";
import type { TacticalRuleConfig } from "./types";

export type GetUnitVisibilityInput = {
  unit: UnitState;
  viewerId: MatchPlayerId;
  visibilities: readonly UnitVisibility[];
};

export type RevealUnitInput = {
  unit: UnitState;
  viewerId: MatchPlayerId;
  visibilities: readonly UnitVisibility[];
  reason: RevealReason;
};

export type RevealUnitResult = {
  visibilities: readonly UnitVisibility[];
  changed: boolean;
  events: readonly GameEventPayload[];
};

export type ApplyRevealOnMoveConfirmedInput = {
  unit: UnitState;
  opponentId: MatchPlayerId;
  visibilities: readonly UnitVisibility[];
  config: TacticalRuleConfig;
};

export type ApplyRevealWhenAttackedInput = {
  defender: UnitState;
  attackerOwnerId: MatchPlayerId;
  visibilities: readonly UnitVisibility[];
  config: TacticalRuleConfig;
};

const makeRuleError = (
  code: RuleError["code"],
  message: string,
  details?: Record<string, unknown>,
): RuleError => ({ code, message, details });

const unchangedRevealResult = (
  visibilities: readonly UnitVisibility[],
): Result<RevealUnitResult, RuleError> => ({
  ok: true,
  value: {
    visibilities: [...visibilities],
    changed: false,
    events: [],
  },
});

export const getUnitVisibility = ({
  unit,
  viewerId,
  visibilities,
}: GetUnitVisibilityInput): VisibilityLevel => {
  if (viewerId === unit.ownerId) {
    return "owner_full";
  }

  for (const visibility of visibilities) {
    if (visibility.unitId !== unit.id || visibility.viewerId !== viewerId) {
      continue;
    }

    if (visibility.level === "revealed") {
      return "revealed";
    }
  }

  return "hidden";
};

export const revealUnitToViewer = ({
  unit,
  viewerId,
  visibilities,
  reason,
}: RevealUnitInput): Result<RevealUnitResult, RuleError> => {
  if (viewerId === unit.ownerId) {
    return unchangedRevealResult(visibilities);
  }

  const currentLevel = getUnitVisibility({ unit, viewerId, visibilities });

  if (currentLevel === "revealed") {
    return unchangedRevealResult(visibilities);
  }

  let convertedHiddenRecord = false;
  let appendedRevealedRecord = false;
  const nextVisibilities: UnitVisibility[] = [];

  for (const visibility of visibilities) {
    const isTargetRecord =
      visibility.unitId === unit.id && visibility.viewerId === viewerId;

    if (!isTargetRecord) {
      nextVisibilities.push({ ...visibility });
      continue;
    }

    if (visibility.level === "hidden") {
      if (!convertedHiddenRecord) {
        nextVisibilities.push({ ...visibility, level: "revealed" });
        convertedHiddenRecord = true;
        appendedRevealedRecord = true;
      }
      continue;
    }

    nextVisibilities.push({ ...visibility });
  }

  if (!appendedRevealedRecord) {
    nextVisibilities.push({
      unitId: unit.id,
      viewerId,
      level: "revealed",
    });
  }

  return {
    ok: true,
    value: {
      visibilities: nextVisibilities,
      changed: true,
      events: [
        {
          type: "UNIT_REVEALED",
          unitId: unit.id,
          viewerId,
          reason,
        },
      ],
    },
  };
};

export const applyRevealOnMoveConfirmed = ({
  unit,
  opponentId,
  visibilities,
  config,
}: ApplyRevealOnMoveConfirmedInput): Result<RevealUnitResult, RuleError> => {
  if (!config.revealOnFirstMove) {
    return unchangedRevealResult(visibilities);
  }

  return revealUnitToViewer({
    unit,
    viewerId: opponentId,
    visibilities,
    reason: "first_move",
  });
};

export const applyRevealWhenAttacked = ({
  defender,
  attackerOwnerId,
  visibilities,
  config,
}: ApplyRevealWhenAttackedInput): Result<RevealUnitResult, RuleError> => {
  if (attackerOwnerId === defender.ownerId) {
    return {
      ok: false,
      error: makeRuleError(
        "SAME_OWNER_COMBAT",
        "Attacker and defender owners must be different for attack reveal.",
        { attackerOwnerId, defenderOwnerId: defender.ownerId },
      ),
    };
  }

  if (!config.revealWhenAttacked) {
    return unchangedRevealResult(visibilities);
  }

  return revealUnitToViewer({
    unit: defender,
    viewerId: attackerOwnerId,
    visibilities,
    reason: "attacked",
  });
};
