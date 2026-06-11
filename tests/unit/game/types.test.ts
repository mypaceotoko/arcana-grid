import { describe, expect, it } from "vitest";

import {
  MOVEMENT_TYPES,
  TACTICAL_DUEL_RULE_CONFIG,
  toMatchPlayerId,
  toUnitId,
} from "../../../src/game";
import type {
  HiddenUnitView,
  Result,
  RuleError,
  UnitView,
} from "../../../src/game";

const describeUnitVisibility = (unit: UnitView): string => {
  if (!unit.revealed) {
    return `hidden:${unit.cardBackKey}`;
  }

  return `revealed:${unit.card.cardName}:${unit.currentDefense}`;
};

const divide = (left: number, right: number): Result<number, RuleError> => {
  if (right === 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_ACTION",
        message: "Division by zero is not allowed.",
      },
    };
  }

  return {
    ok: true,
    value: left / right,
  };
};

describe("game engine types", () => {
  it("keeps tactical duel rule constants centralized", () => {
    expect(TACTICAL_DUEL_RULE_CONFIG).toMatchObject({
      gameMode: "tactical_duel",
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
    });
  });

  it("exports the MVP movement identifiers", () => {
    expect(MOVEMENT_TYPES).toEqual([
      "orthogonal",
      "diagonal",
      "adjacent",
      "special_offset",
    ]);
  });

  it("narrows unit views with the revealed discriminator", () => {
    const hiddenUnit: HiddenUnitView = {
      revealed: false,
      unitId: toUnitId("unit-1"),
      ownerId: toMatchPlayerId("match-player-1"),
      position: { row: 0, col: 0 },
      status: "board",
      cardBackKey: "arcana-grid-default-back",
    };

    expect(describeUnitVisibility(hiddenUnit)).toBe(
      "hidden:arcana-grid-default-back",
    );
  });

  it("uses Result without throwing for expected rule failures", () => {
    const success = divide(6, 2);
    const failure = divide(1, 0);

    expect(success).toEqual({ ok: true, value: 3 });
    expect(failure).toEqual({
      ok: false,
      error: {
        code: "INVALID_ACTION",
        message: "Division by zero is not allowed.",
      },
    });
  });

  it("does not expose secret card fields on hidden unit views", () => {
    const hiddenUnit: HiddenUnitView = {
      revealed: false,
      unitId: toUnitId("unit-2"),
      ownerId: toMatchPlayerId("match-player-2"),
      position: null,
      status: "reserve",
      cardBackKey: "arcana-grid-default-back",
    };

    expect("card" in hiddenUnit).toBe(false);
    expect("currentDefense" in hiddenUnit).toBe(false);
    expect("stance" in hiddenUnit).toBe(false);
    // @ts-expect-error HiddenUnitView must not carry secret card details.
    hiddenUnit.cardName;
  });
});
