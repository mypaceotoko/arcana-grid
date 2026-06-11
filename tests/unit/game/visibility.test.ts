import { describe, expect, it } from "vitest";

import {
  TACTICAL_DUEL_RULE_CONFIG,
  applyRevealOnMoveConfirmed,
  applyRevealWhenAttacked,
  getUnitVisibility,
  revealUnitToViewer,
  toCardId,
  toCharacterId,
  toMatchPlayerId,
  toUnitId,
} from "../../../src/game";
import type {
  CardSnapshot,
  UnitState,
  UnitVisibility,
} from "../../../src/game";

const owner = toMatchPlayerId("player-owner");
const opponent = toMatchPlayerId("player-opponent");
const other = toMatchPlayerId("player-other");

const card = (key: string): CardSnapshot => ({
  cardId: toCardId(`card-${key}`),
  characterId: toCharacterId(`character-${key}`),
  characterKey: `secret-character-${key}`,
  cardKey: `secret-card-${key}`,
  cardName: `Secret ${key}`,
  movementType: "orthogonal",
  movementRule: {
    kind: "line",
    directions: [{ row: 1, col: 0 }],
    maxDistance: null,
  },
  baseAttack: 3000,
  baseDefense: 2500,
  attribute: "dark",
  rarity: "legendary",
  artworkUrl: `https://example.test/${key}.png`,
  abilityData: { secretAbility: key },
});

const unit = (id = "unit-secret"): UnitState => ({
  id: toUnitId(id),
  ownerId: owner,
  card: card(id),
  status: "board",
  position: { row: 2, col: 3 },
  stance: "defense",
  currentDefense: 2500,
});

const disabledMoveRevealConfig = {
  ...TACTICAL_DUEL_RULE_CONFIG,
  revealOnFirstMove: false,
};

const disabledAttackRevealConfig = {
  ...TACTICAL_DUEL_RULE_CONFIG,
  revealWhenAttacked: false,
};

describe("getUnitVisibility", () => {
  it("returns owner_full for the owner even without visibility records", () => {
    expect(
      getUnitVisibility({ unit: unit(), viewerId: owner, visibilities: [] }),
    ).toBe("owner_full");
  });

  it("returns hidden for an opponent without records", () => {
    expect(
      getUnitVisibility({ unit: unit(), viewerId: opponent, visibilities: [] }),
    ).toBe("hidden");
  });

  it("returns hidden for an opponent hidden record", () => {
    const target = unit();
    expect(
      getUnitVisibility({
        unit: target,
        viewerId: opponent,
        visibilities: [
          { unitId: target.id, viewerId: opponent, level: "hidden" },
        ],
      }),
    ).toBe("hidden");
  });

  it("returns revealed for an opponent revealed record", () => {
    const target = unit();
    expect(
      getUnitVisibility({
        unit: target,
        viewerId: opponent,
        visibilities: [
          { unitId: target.id, viewerId: opponent, level: "revealed" },
        ],
      }),
    ).toBe("revealed");
  });

  it("is deterministic with duplicate records and revealed beats hidden", () => {
    const target = unit();
    const visibilities: readonly UnitVisibility[] = [
      { unitId: target.id, viewerId: opponent, level: "hidden" },
      { unitId: target.id, viewerId: opponent, level: "revealed" },
      { unitId: target.id, viewerId: opponent, level: "hidden" },
    ];

    expect(
      getUnitVisibility({ unit: target, viewerId: opponent, visibilities }),
    ).toBe("revealed");
    expect(
      getUnitVisibility({
        unit: target,
        viewerId: opponent,
        visibilities: [...visibilities].reverse(),
      }),
    ).toBe("revealed");
  });

  it("does not trust invalid owner_full records for non-owners", () => {
    const target = unit();
    expect(
      getUnitVisibility({
        unit: target,
        viewerId: opponent,
        visibilities: [
          { unitId: target.id, viewerId: opponent, level: "owner_full" },
        ],
      }),
    ).toBe("hidden");
  });
});

describe("revealUnitToViewer", () => {
  it("changes a hidden record to revealed and emits one event", () => {
    const target = unit();
    const input: readonly UnitVisibility[] = [
      { unitId: target.id, viewerId: opponent, level: "hidden" },
    ];
    const snapshot = structuredClone(input);
    const result = revealUnitToViewer({
      unit: target,
      viewerId: opponent,
      visibilities: input,
      reason: "first_move",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.changed).toBe(true);
    expect(result.value.visibilities).toEqual([
      { unitId: target.id, viewerId: opponent, level: "revealed" },
    ]);
    expect(result.value.events).toEqual([
      {
        type: "UNIT_REVEALED",
        unitId: target.id,
        viewerId: opponent,
        reason: "first_move",
      },
    ]);
    expect(input).toEqual(snapshot);
  });

  it("adds one revealed record when no target record exists", () => {
    const target = unit();
    const result = revealUnitToViewer({
      unit: target,
      viewerId: opponent,
      visibilities: [
        { unitId: target.id, viewerId: other, level: "hidden" },
      ],
      reason: "attacked",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.visibilities).toEqual([
      { unitId: target.id, viewerId: other, level: "hidden" },
      { unitId: target.id, viewerId: opponent, level: "revealed" },
    ]);
  });

  it("does not duplicate records or events when already revealed", () => {
    const target = unit();
    const visibilities: readonly UnitVisibility[] = [
      { unitId: target.id, viewerId: opponent, level: "revealed" },
    ];
    const result = revealUnitToViewer({
      unit: target,
      viewerId: opponent,
      visibilities,
      reason: "attacked",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.changed).toBe(false);
    expect(result.value.visibilities).toEqual(visibilities);
    expect(result.value.events).toEqual([]);
  });

  it("does not create a visibility record for the owner", () => {
    const target = unit();
    const result = revealUnitToViewer({
      unit: target,
      viewerId: owner,
      visibilities: [],
      reason: "first_move",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.changed).toBe(false);
    expect(result.value.visibilities).toEqual([]);
    expect(result.value.events).toEqual([]);
  });

  it("collapses duplicate hidden records without changing invalid owner_full records", () => {
    const target = unit();
    const result = revealUnitToViewer({
      unit: target,
      viewerId: opponent,
      visibilities: [
        { unitId: target.id, viewerId: opponent, level: "owner_full" },
        { unitId: target.id, viewerId: opponent, level: "hidden" },
        { unitId: target.id, viewerId: opponent, level: "hidden" },
      ],
      reason: "attacked",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.visibilities).toEqual([
      { unitId: target.id, viewerId: opponent, level: "owner_full" },
      { unitId: target.id, viewerId: opponent, level: "revealed" },
    ]);
  });
});

describe("applyRevealOnMoveConfirmed", () => {
  it("reveals to the opponent with reason first_move when enabled", () => {
    const target = unit();
    const result = applyRevealOnMoveConfirmed({
      unit: target,
      opponentId: opponent,
      visibilities: [],
      config: TACTICAL_DUEL_RULE_CONFIG,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.changed).toBe(true);
    expect(result.value.events[0]).toMatchObject({ reason: "first_move" });
  });

  it("does nothing when revealOnFirstMove is false or already revealed", () => {
    const target = unit();
    const disabled = applyRevealOnMoveConfirmed({
      unit: target,
      opponentId: opponent,
      visibilities: [],
      config: disabledMoveRevealConfig,
    });
    const revealed = applyRevealOnMoveConfirmed({
      unit: target,
      opponentId: opponent,
      visibilities: [
        { unitId: target.id, viewerId: opponent, level: "revealed" },
      ],
      config: TACTICAL_DUEL_RULE_CONFIG,
    });

    expect(disabled.ok && disabled.value.changed).toBe(false);
    expect(revealed.ok && revealed.value.changed).toBe(false);
    expect("hasMoved" in target).toBe(false);
  });
});

describe("applyRevealWhenAttacked", () => {
  it("reveals the defender to the attacker with reason attacked", () => {
    const defender = unit("defender");
    const result = applyRevealWhenAttacked({
      defender,
      attackerOwnerId: opponent,
      visibilities: [],
      config: TACTICAL_DUEL_RULE_CONFIG,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.changed).toBe(true);
    expect(result.value.events).toEqual([
      {
        type: "UNIT_REVEALED",
        unitId: defender.id,
        viewerId: opponent,
        reason: "attacked",
      },
    ]);
  });

  it("does nothing when revealWhenAttacked is false or already revealed", () => {
    const defender = unit("defender");
    const disabled = applyRevealWhenAttacked({
      defender,
      attackerOwnerId: opponent,
      visibilities: [],
      config: disabledAttackRevealConfig,
    });
    const revealed = applyRevealWhenAttacked({
      defender,
      attackerOwnerId: opponent,
      visibilities: [
        { unitId: defender.id, viewerId: opponent, level: "revealed" },
      ],
      config: TACTICAL_DUEL_RULE_CONFIG,
    });

    expect(disabled.ok && disabled.value.changed).toBe(false);
    expect(revealed.ok && revealed.value.changed).toBe(false);
  });

  it("rejects same-owner attack reveal as invalid input", () => {
    const result = applyRevealWhenAttacked({
      defender: unit("defender"),
      attackerOwnerId: owner,
      visibilities: [],
      config: TACTICAL_DUEL_RULE_CONFIG,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("SAME_OWNER_COMBAT");
  });
});
