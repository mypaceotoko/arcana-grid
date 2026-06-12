import { describe, expect, it } from "vitest";

import {
  TACTICAL_DUEL_RULE_CONFIG,
  resolveCombat,
  toCardId,
  toCharacterId,
  toMatchPlayerId,
  toUnitId,
} from "../../../src/game";
import type {
  CardSnapshot,
  CombatResult,
  Coordinate,
  GameEventPayload,
  Stance,
  UnitState,
} from "../../../src/game";

const playerA = toMatchPlayerId("player-a");
const playerB = toMatchPlayerId("player-b");
const attackerOrigin: Coordinate = { row: 3, col: 3 };
const destination: Coordinate = { row: 3, col: 4 };

const card = (key: string, baseAttack: number): CardSnapshot => ({
  cardId: toCardId(`card-${key}`),
  characterId: toCharacterId(`character-${key}`),
  characterKey: `character-${key}`,
  cardKey: `card-${key}`,
  cardName: `Test ${key}`,
  movementType: "orthogonal",
  movementRule: {
    kind: "line",
    directions: [
      { row: -1, col: 0 },
      { row: 1, col: 0 },
      { row: 0, col: -1 },
      { row: 0, col: 1 },
    ],
    maxDistance: null,
  },
  baseAttack,
  baseDefense: 1000,
  attribute: "neutral",
  artworkUrl: null,
  abilityData: {},
});

const unit = ({
  id,
  ownerId,
  position,
  baseAttack,
  currentDefense,
  stance = "attack",
  status = "board",
}: {
  id: string;
  ownerId: UnitState["ownerId"];
  position: UnitState["position"];
  baseAttack: number;
  currentDefense: number;
  stance?: Stance;
  status?: UnitState["status"];
}): UnitState => ({
  id: toUnitId(id),
  ownerId,
  card: card(id, baseAttack),
  status,
  position,
  stance,
  currentDefense,
});

const attacker = (baseAttack = 3000, currentDefense = 2500): UnitState =>
  unit({
    id: "attacker",
    ownerId: playerA,
    position: attackerOrigin,
    baseAttack,
    currentDefense,
  });

const defender = ({
  baseAttack = 2000,
  currentDefense = 2000,
  stance = "attack",
}: {
  baseAttack?: number;
  currentDefense?: number;
  stance?: Stance;
} = {}): UnitState =>
  unit({
    id: "defender",
    ownerId: playerB,
    position: destination,
    baseAttack,
    currentDefense,
    stance,
  });

const resolveOk = (
  attackerUnit: UnitState,
  defenderUnit: UnitState,
  origin = attackerOrigin,
  target = destination,
): CombatResult => {
  const result = resolveCombat({
    attacker: attackerUnit,
    defender: defenderUnit,
    attackerOrigin: origin,
    destination: target,
    config: TACTICAL_DUEL_RULE_CONFIG,
  });

  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.value;
};

const eventTypes = (events: readonly GameEventPayload[]): readonly string[] =>
  events.map((event) => event.type);

describe("resolveCombat attack stance clashes", () => {
  it("keeps only the stronger attacker alive and moves it to the destination", () => {
    const result = resolveOk(attacker(3000, 2500), defender({ baseAttack: 2000 }));

    expect(result.outcome).toBe("attacker_survived_attack_clash");
    expect(result.attacker.status).toBe("board");
    expect(result.attacker.position).toEqual(destination);
    expect(result.attacker.currentDefense).toBe(500);
    expect(result.defender.status).toBe("defeated");
    expect(result.defender.position).toBeNull();
    expect(result.defender.currentDefense).toBe(0);
    expect(result.destinationOccupant).toBe("attacker");
  });

  it("defeats both units when counter damage brings the attacker exactly to zero", () => {
    const result = resolveOk(attacker(3000, 2000), defender({ baseAttack: 2000 }));

    expect(result.outcome).toBe("both_defeated");
    expect(result.attacker.currentDefense).toBe(0);
    expect(result.attacker.position).toBeNull();
    expect(result.defender.currentDefense).toBe(0);
    expect(result.defender.position).toBeNull();
    expect(result.destinationOccupant).toBe("none");
  });

  it("defeats both units and never stores a negative attacker defense", () => {
    const result = resolveOk(attacker(3000, 1500), defender({ baseAttack: 2000 }));

    expect(result.outcome).toBe("both_defeated");
    expect(result.attacker.currentDefense).toBe(0);
    expect(result.defender.currentDefense).toBe(0);
  });

  it("keeps only the stronger defender alive on its original square", () => {
    const result = resolveOk(attacker(1800, 1000), defender({ baseAttack: 2000 }));

    expect(result.outcome).toBe("defender_survived_attack_clash");
    expect(result.attacker.status).toBe("defeated");
    expect(result.attacker.position).toBeNull();
    expect(result.defender.status).toBe("board");
    expect(result.defender.position).toEqual(destination);
    expect(result.defender.currentDefense).toBe(200);
    expect(result.destinationOccupant).toBe("defender");
  });

  it("defeats both units when clash damage brings the defender exactly to zero", () => {
    const result = resolveOk(
      attacker(2000, 1000),
      defender({ baseAttack: 2500, currentDefense: 2000 }),
    );

    expect(result.outcome).toBe("both_defeated");
    expect(result.attacker.currentDefense).toBe(0);
    expect(result.defender.currentDefense).toBe(0);
    expect(result.destinationOccupant).toBe("none");
  });

  it("defeats both units and never stores a negative defender defense", () => {
    const result = resolveOk(
      attacker(2000, 1000),
      defender({ baseAttack: 2500, currentDefense: 1500 }),
    );

    expect(result.outcome).toBe("both_defeated");
    expect(result.defender.currentDefense).toBe(0);
    expect(result.destinationOccupant).toBe("none");
  });

  it("defeats both units without extra damage calculation on equal ATK", () => {
    const result = resolveOk(
      attacker(2000, 9999),
      defender({ baseAttack: 2000, currentDefense: 8888 }),
    );

    expect(result.outcome).toBe("both_defeated");
    expect(result.attacker.status).toBe("defeated");
    expect(result.defender.status).toBe("defeated");
    expect(result.attacker.position).toBeNull();
    expect(result.defender.position).toBeNull();
    expect(result.attacker.currentDefense).toBe(0);
    expect(result.defender.currentDefense).toBe(0);
    expect(result.destinationOccupant).toBe("none");
  });
});

describe("resolveCombat defense stance", () => {
  it("keeps both units alive when defense holds", () => {
    const result = resolveOk(
      attacker(2000, 2500),
      defender({ currentDefense: 4000, stance: "defense" }),
    );

    expect(result.outcome).toBe("defense_held");
    expect(result.attacker.status).toBe("board");
    expect(result.attacker.position).toEqual(attackerOrigin);
    expect(result.attacker.currentDefense).toBe(2500);
    expect(result.defender.status).toBe("board");
    expect(result.defender.position).toEqual(destination);
    expect(result.defender.currentDefense).toBe(2000);
    expect(result.destinationOccupant).toBe("defender");
  });

  it("defeats a defense stance defender exactly at zero and moves the attacker in", () => {
    const result = resolveOk(
      attacker(2500, 2500),
      defender({ currentDefense: 2500, stance: "defense" }),
    );

    expect(result.outcome).toBe("defender_defeated");
    expect(result.attacker.position).toEqual(destination);
    expect(result.attacker.currentDefense).toBe(2500);
    expect(result.defender.status).toBe("defeated");
    expect(result.defender.currentDefense).toBe(0);
    expect(result.destinationOccupant).toBe("attacker");
  });

  it("defeats a defense stance defender below zero without storing a negative defense", () => {
    const result = resolveOk(
      attacker(2500, 2500),
      defender({ currentDefense: 2000, stance: "defense" }),
    );

    expect(result.outcome).toBe("defender_defeated");
    expect(result.attacker.position).toEqual(destination);
    expect(result.attacker.currentDefense).toBe(2500);
    expect(result.defender.currentDefense).toBe(0);
  });
});

describe("resolveCombat events", () => {
  it("emits combat, defense change, and defeat events in a deterministic order", () => {
    const result = resolveOk(attacker(3000, 2500), defender({ baseAttack: 2000 }));

    expect(eventTypes(result.events)).toEqual([
      "COMBAT_RESOLVED",
      "DEFENSE_CHANGED",
      "DEFENSE_CHANGED",
      "UNIT_DEFEATED",
    ]);
    expect(result.events[0]).toMatchObject({
      type: "COMBAT_RESOLVED",
      attackerUnitId: toUnitId("attacker"),
      defenderUnitId: toUnitId("defender"),
      attackerStance: "attack",
      defenderStance: "attack",
      attackerAttack: 3000,
      defenderAttack: 2000,
      attackerDefenseBefore: 2500,
      attackerDefenseAfter: 500,
      defenderDefenseAfter: 0,
      attackerMovedToDestination: true,
      outcome: "attacker_survived_attack_clash",
    });
    expect(result.events[1]).toMatchObject({
      type: "DEFENSE_CHANGED",
      unitId: toUnitId("attacker"),
      previousDefense: 2500,
      nextDefense: 500,
    });
    expect(result.events[2]).toMatchObject({
      type: "DEFENSE_CHANGED",
      unitId: toUnitId("defender"),
      nextDefense: 0,
    });
    expect(result.events[3]).toMatchObject({
      type: "UNIT_DEFEATED",
      unitId: toUnitId("defender"),
    });
  });

  it("emits both defeated units in attacker then defender order", () => {
    const result = resolveOk(attacker(2000, 1000), defender({ baseAttack: 2000 }));

    expect(eventTypes(result.events)).toEqual([
      "COMBAT_RESOLVED",
      "DEFENSE_CHANGED",
      "DEFENSE_CHANGED",
      "UNIT_DEFEATED",
      "UNIT_DEFEATED",
    ]);
    expect(result.events[3]).toMatchObject({
      type: "UNIT_DEFEATED",
      unitId: toUnitId("attacker"),
    });
    expect(result.events[4]).toMatchObject({
      type: "UNIT_DEFEATED",
      unitId: toUnitId("defender"),
    });
  });

  it("does not emit unrelated events", () => {
    const result = resolveOk(
      attacker(2000, 2500),
      defender({ currentDefense: 4000, stance: "defense" }),
    );

    expect(eventTypes(result.events)).toEqual([
      "COMBAT_RESOLVED",
      "DEFENSE_CHANGED",
    ]);
    expect(eventTypes(result.events)).not.toContain("UNIT_MOVED");
    expect(eventTypes(result.events)).not.toContain("TURN_CHANGED");
    expect(eventTypes(result.events)).not.toContain("MATCH_FINISHED");
    expect(eventTypes(result.events)).not.toContain("UNIT_REVEALED");
    expect(eventTypes(result.events)).not.toContain("FLAG_DAMAGED");
  });
});

describe("resolveCombat validation and purity", () => {
  const expectError = (
    attackerUnit: UnitState,
    defenderUnit: UnitState,
    origin = attackerOrigin,
    target = destination,
  ): string => {
    const result = resolveCombat({
      attacker: attackerUnit,
      defender: defenderUnit,
      attackerOrigin: origin,
      destination: target,
      config: TACTICAL_DUEL_RULE_CONFIG,
    });

    expect(result.ok).toBe(false);
    return result.ok ? "" : result.error.code;
  };

  it("rejects same owner combat", () => {
    expect(
      expectError(
        attacker(),
        unit({
          id: "defender",
          ownerId: playerA,
          position: destination,
          baseAttack: 2000,
          currentDefense: 2000,
        }),
      ),
    ).toBe("SAME_OWNER_COMBAT");
  });

  it("rejects the same unit as both combatants", () => {
    const sameUnit = attacker();

    expect(expectError(sameUnit, sameUnit)).toBe("INVALID_COMBATANTS");
  });

  it("rejects reserve, defeated, and null-position combatants", () => {
    expect(
      expectError(
        unit({
          id: "attacker",
          ownerId: playerA,
          position: attackerOrigin,
          baseAttack: 1000,
          currentDefense: 1000,
          status: "reserve",
        }),
        defender(),
      ),
    ).toBe("COMBATANT_NOT_ON_BOARD");
    expect(
      expectError(
        attacker(),
        unit({
          id: "defender",
          ownerId: playerB,
          position: destination,
          baseAttack: 1000,
          currentDefense: 1000,
          status: "defeated",
        }),
      ),
    ).toBe("COMBATANT_NOT_ON_BOARD");
    expect(
      expectError(
        unit({
          id: "attacker",
          ownerId: playerA,
          position: null,
          baseAttack: 1000,
          currentDefense: 1000,
        }),
        defender(),
      ),
    ).toBe("COMBATANT_NOT_ON_BOARD");
  });

  it("rejects destination and attacker origin mismatches", () => {
    expect(expectError(attacker(), defender(), { row: 0, col: 0 })).toBe(
      "INVALID_COMBAT_DESTINATION",
    );
    expect(
      expectError(attacker(), defender(), attackerOrigin, { row: 0, col: 0 }),
    ).toBe("INVALID_COMBAT_DESTINATION");
  });

  it("rejects invalid baseAttack and currentDefense values", () => {
    expect(expectError(attacker(-1), defender())).toBe("INVALID_COMBAT_VALUE");
    expect(expectError(attacker(), defender({ baseAttack: -1 }))).toBe(
      "INVALID_COMBAT_VALUE",
    );
    expect(expectError(attacker(1000, -1), defender())).toBe(
      "INVALID_COMBAT_VALUE",
    );
    expect(expectError(attacker(Number.NaN), defender())).toBe(
      "INVALID_COMBAT_VALUE",
    );
    expect(expectError(attacker(), defender({ currentDefense: -1 }))).toBe(
      "INVALID_COMBAT_VALUE",
    );
  });

  it("does not mutate input units or coordinates", () => {
    const inputAttacker = attacker(3000, 2500);
    const inputDefender = defender({ baseAttack: 2000 });
    const origin = { row: attackerOrigin.row, col: attackerOrigin.col };
    const target = { row: destination.row, col: destination.col };
    const originalAttacker = { ...inputAttacker, card: { ...inputAttacker.card } };
    const originalDefender = { ...inputDefender, card: { ...inputDefender.card } };
    const originalOrigin = { ...origin };
    const originalTarget = { ...target };

    resolveOk(inputAttacker, inputDefender, origin, target);

    expect(inputAttacker).toEqual(originalAttacker);
    expect(inputDefender).toEqual(originalDefender);
    expect(origin).toEqual(originalOrigin);
    expect(target).toEqual(originalTarget);
  });
});
