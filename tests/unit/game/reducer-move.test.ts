import { describe, expect, it } from "vitest";

import {
  TACTICAL_DUEL_RULE_CONFIG,
  applyMoveUnitAction,
  applyTacticalDuelAction,
  toActionId,
  toCardId,
  toCharacterId,
  toMatchId,
  toMatchPlayerId,
  toPlayerId,
  toUnitId,
} from "../../../src/game";
import type {
  CardSnapshot,
  GameEventPayload,
  MatchPlayerState,
  MatchState,
  MoveUnitAction,
  Result,
  RuleError,
  Stance,
  TacticalDuelActionResult,
  TacticalRuleConfig,
  UnitState,
  UnitVisibility,
} from "../../../src/game";

const matchId = toMatchId("match-1");
const playerA = toMatchPlayerId("player-a");
const playerB = toMatchPlayerId("player-b");
const outsider = toMatchPlayerId("outsider");
const config: TacticalRuleConfig = TACTICAL_DUEL_RULE_CONFIG;

const card = (
  key: string,
  {
    baseAttack = 1000,
    baseDefense = 3000,
    maxDistance = null,
  }: {
    baseAttack?: number;
    baseDefense?: number;
    maxDistance?: number | null;
  } = {},
): CardSnapshot => ({
  cardId: toCardId(`card-${key}`),
  characterId: toCharacterId(`character-${key}`),
  characterKey: `character-${key}`,
  cardKey: `card-${key}`,
  cardName: `Card ${key}`,
  movementType: "orthogonal",
  movementRule: {
    kind: "line",
    directions: [
      { row: -1, col: 0 },
      { row: 1, col: 0 },
      { row: 0, col: -1 },
      { row: 0, col: 1 },
    ],
    maxDistance,
  },
  baseAttack,
  baseDefense,
  attribute: "neutral",
  artworkUrl: `https://example.test/${key}.png`,
  abilityData: { secret: key },
});

const player = (
  id: MatchPlayerState["id"],
  side: MatchPlayerState["side"],
): MatchPlayerState => ({
  id,
  playerId: toPlayerId(`account-${id}`),
  side,
  reserveUnitIds: [],
  flag: { ownerId: id, damage: 0, maxDamage: 3 },
  connected: true,
  setupSubmitted: false,
});

const unit = ({
  id,
  ownerId,
  position,
  status = "board",
  stance = "attack",
  baseAttack = 1000,
  baseDefense = 3000,
  currentDefense = baseDefense,
  maxDistance = null,
}: {
  id: string;
  ownerId: UnitState["ownerId"];
  position: UnitState["position"];
  status?: UnitState["status"];
  stance?: Stance;
  baseAttack?: number;
  baseDefense?: number;
  currentDefense?: number;
  maxDistance?: number | null;
}): UnitState => ({
  id: toUnitId(id),
  ownerId,
  card: card(id, { baseAttack, baseDefense, maxDistance }),
  status,
  position,
  stance,
  currentDefense,
});

const baseState = (overrides: Partial<MatchState> = {}): MatchState => ({
  id: matchId,
  gameMode: "tactical_duel",
  rulesVersion: config.rulesVersion,
  boardSize: { width: 8, height: 8 },
  phase: "active",
  players: [player(playerA, "south"), player(playerB, "north")],
  units: [
    unit({ id: "attacker", ownerId: playerA, position: { row: 4, col: 3 } }),
    unit({ id: "ally", ownerId: playerA, position: { row: 4, col: 1 } }),
    unit({ id: "enemy", ownerId: playerB, position: { row: 4, col: 5 } }),
    unit({ id: "enemy-backup", ownerId: playerB, position: { row: 6, col: 6 } }),
  ],
  unitVisibilities: [],
  currentTurnPlayerId: playerA,
  turnNumber: 7,
  stateVersion: 11,
  winnerPlayerId: null,
  winReason: null,
  ...overrides,
});

const action = (overrides: Partial<MoveUnitAction> = {}): MoveUnitAction => ({
  type: "MOVE_UNIT",
  actionId: toActionId("action-1"),
  matchId,
  actorId: playerA,
  unitId: toUnitId("attacker"),
  destination: { row: 3, col: 3 },
  nextStance: "defense",
  expectedStateVersion: 11,
  ...overrides,
});

const unwrap = <T>(result: Result<T, RuleError>): T => {
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
};

const expectErrorCode = <T>(
  result: Result<T, RuleError>,
  code: RuleError["code"],
): RuleError => {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("Expected an error result.");
  }
  expect(result.error.code).toBe(code);
  return result.error;
};

const eventTypes = (events: readonly GameEventPayload[]): readonly string[] =>
  events.map((event) => event.type);

const cloneJson = (value: unknown): string => JSON.stringify(value);

const getUnit = (state: MatchState, id: string): UnitState => {
  const found = state.units.find((candidate) => candidate.id === toUnitId(id));
  if (found === undefined) {
    throw new Error(`Unit ${id} not found.`);
  }
  return found;
};

const runMove = (
  state: MatchState,
  moveAction: MoveUnitAction,
): TacticalDuelActionResult => unwrap(applyMoveUnitAction({ state, action: moveAction, config }));

describe("applyTacticalDuelAction unsupported actions", () => {
  it("rejects actions other than MOVE_UNIT and DEPLOY_RESERVE without mutating state", () => {
    const state = baseState();
    const before = cloneJson(state);
    const unsupportedAction = { type: "UNSUPPORTED_ACTION" as const };

    expectErrorCode(
      applyTacticalDuelAction({ state, action: unsupportedAction, config }),
      "UNSUPPORTED_ACTION",
    );
    expect(cloneJson(state)).toBe(before);
  });
});

describe("applyMoveUnitAction pre-validation", () => {
  const cases: readonly [string, MatchState, MoveUnitAction, RuleError["code"]][] = [
    ["matchId mismatch", baseState(), action({ matchId: toMatchId("other") }), "MATCH_ID_MISMATCH"],
    ["unsupported game mode", baseState({ gameMode: "territory_battle" as MatchState["gameMode"] }), action(), "UNSUPPORTED_GAME_MODE"],
    ["non-active phase", baseState({ phase: "setup" }), action(), "INVALID_PHASE"],
    ["finished phase", baseState({ phase: "finished", winnerPlayerId: playerA, winReason: "annihilation" }), action(), "MATCH_FINISHED"],
    ["missing current turn", baseState({ currentTurnPlayerId: null }), action(), "CURRENT_TURN_PLAYER_MISSING"],
    ["opponent turn", baseState({ currentTurnPlayerId: playerB }), action(), "NOT_YOUR_TURN"],
    ["stale state", baseState(), action({ expectedStateVersion: 10 }), "STALE_STATE_VERSION"],
    ["actor outside players", baseState(), action({ actorId: outsider }), "NOT_YOUR_TURN"],
    ["unit missing", baseState(), action({ unitId: toUnitId("missing") }), "UNIT_NOT_FOUND"],
    ["target unit duplicated", baseState({ units: [...baseState().units, getUnit(baseState(), "attacker")] }), action(), "DUPLICATE_UNIT"],
    ["non-target unit duplicated", baseState({ units: [...baseState().units, getUnit(baseState(), "enemy")] }), action(), "DUPLICATE_UNIT"],
    ["unit not owned", baseState(), action({ unitId: toUnitId("enemy") }), "UNIT_NOT_OWNED"],
    ["reserve unit", baseState({ units: [unit({ id: "attacker", ownerId: playerA, status: "reserve", position: null }), unit({ id: "enemy", ownerId: playerB, position: { row: 6, col: 6 } })] }), action(), "UNIT_NOT_ON_BOARD"],
    ["defeated unit", baseState({ units: [unit({ id: "attacker", ownerId: playerA, status: "defeated", position: null, currentDefense: 0 }), unit({ id: "enemy", ownerId: playerB, position: { row: 6, col: 6 } })] }), action(), "UNIT_DEFEATED"],
    ["null board position", baseState({ units: [unit({ id: "attacker", ownerId: playerA, status: "board", position: null }), unit({ id: "enemy", ownerId: playerB, position: { row: 6, col: 6 } })] }), action(), "UNIT_NOT_ON_BOARD"],
    ["out of bounds", baseState(), action({ destination: { row: -1, col: 3 } }), "OUT_OF_BOUNDS"],
    ["illegal move", baseState(), action({ destination: { row: 2, col: 4 } }), "DESTINATION_NOT_LEGAL"],
    ["flag area", baseState(), action({ destination: { row: 7, col: 3 } }), "FLAG_AREA_REQUIRES_FLAG_ACTION"],
    ["duplicate players", baseState({ players: [player(playerA, "south"), player(playerA, "north")] }), action(), "DUPLICATE_MATCH_PLAYER"],
    ["invalid player count", baseState({ players: [player(playerA, "south")] }), action(), "INVALID_PLAYER_COUNT"],
  ];

  it.each(cases)("rejects %s", (_name, state, moveAction, code) => {
    const stateBefore = cloneJson(state);
    const actionBefore = cloneJson(moveAction);
    const configBefore = cloneJson(config);
    const result = applyMoveUnitAction({ state, action: moveAction, config });

    expectErrorCode(result, code);
    expect(cloneJson(state)).toBe(stateBefore);
    expect(cloneJson(moveAction)).toBe(actionBefore);
    expect(cloneJson(config)).toBe(configBefore);
  });
});

describe("applyMoveUnitAction normal movement", () => {
  it("moves to an empty legal square, reveals first move, advances turn, and preserves unrelated data", () => {
    const state = baseState();
    const stateBefore = cloneJson(state);
    const moveAction = action({ destination: { row: 3, col: 3 }, nextStance: "defense" });
    const result = runMove(state, moveAction);
    const moved = getUnit(result.state, "attacker");
    const original = getUnit(state, "attacker");

    expect(moved).not.toBe(original);
    expect(moved.position).toEqual({ row: 3, col: 3 });
    expect(moved.stance).toBe("defense");
    expect(moved.status).toBe("board");
    expect(moved.currentDefense).toBe(original.currentDefense);
    expect(moved.card).toBe(original.card);
    expect(moved.ownerId).toBe(playerA);
    expect(moved.id).toBe(toUnitId("attacker"));
    expect(getUnit(result.state, "ally")).toBe(getUnit(state, "ally"));
    expect(result.state.unitVisibilities).toEqual([
      { unitId: toUnitId("attacker"), viewerId: playerB, level: "revealed" },
    ]);
    expect(result.state.stateVersion).toBe(12);
    expect(result.state.turnNumber).toBe(8);
    expect(result.state.currentTurnPlayerId).toBe(playerB);
    expect(eventTypes(result.events)).toEqual([
      "UNIT_REVEALED",
      "UNIT_MOVED",
      "TURN_CHANGED",
    ]);
    expect(result.events[1]).toEqual({
      type: "UNIT_MOVED",
      unitId: toUnitId("attacker"),
      ownerId: playerA,
      from: { row: 4, col: 3 },
      to: { row: 3, col: 3 },
      stance: "defense",
    });
    expect(result.events.at(-1)).toEqual({
      type: "TURN_CHANGED",
      previousPlayerId: playerA,
      nextPlayerId: playerB,
      turnNumber: 8,
    });
    expect(cloneJson(state)).toBe(stateBefore);
  });

  it("does not emit duplicate reveal events when the mover is already revealed", () => {
    const visibilities: UnitVisibility[] = [
      { unitId: toUnitId("attacker"), viewerId: playerB, level: "revealed" },
    ];
    const result = runMove(baseState({ unitVisibilities: visibilities }), action());

    expect(eventTypes(result.events)).toEqual(["UNIT_MOVED", "TURN_CHANGED"]);
    expect(result.state.unitVisibilities).toEqual(visibilities);
  });
});

describe("applyMoveUnitAction combat movement", () => {
  it("uses resolveCombat against attack stance defenders and updates only combatants", () => {
    const state = baseState({
      units: [
        unit({ id: "attacker", ownerId: playerA, position: { row: 4, col: 3 }, baseAttack: 3000, currentDefense: 2500 }),
        unit({ id: "ally", ownerId: playerA, position: { row: 6, col: 0 } }),
        unit({ id: "enemy", ownerId: playerB, position: { row: 4, col: 5 }, baseAttack: 2000, currentDefense: 3000, stance: "attack" }),
        unit({ id: "enemy-backup", ownerId: playerB, position: { row: 6, col: 6 } }),
      ],
    });
    const result = runMove(state, action({ destination: { row: 4, col: 5 }, nextStance: "defense" }));
    const attacker = getUnit(result.state, "attacker");
    const defender = getUnit(result.state, "enemy");

    expect(attacker.status).toBe("board");
    expect(attacker.position).toEqual({ row: 4, col: 5 });
    expect(attacker.currentDefense).toBe(500);
    expect(attacker.stance).toBe("defense");
    expect(defender.status).toBe("defeated");
    expect(defender.position).toBeNull();
    expect(getUnit(result.state, "ally")).toBe(getUnit(state, "ally"));
    expect(getUnit(result.state, "enemy-backup")).toBe(getUnit(state, "enemy-backup"));
    expect(result.state.unitVisibilities).toEqual([
      { unitId: toUnitId("attacker"), viewerId: playerB, level: "revealed" },
      { unitId: toUnitId("enemy"), viewerId: playerA, level: "revealed" },
    ]);
    expect(eventTypes(result.events)).toEqual([
      "UNIT_REVEALED",
      "UNIT_REVEALED",
      "COMBAT_RESOLVED",
      "DEFENSE_CHANGED",
      "DEFENSE_CHANGED",
      "UNIT_DEFEATED",
      "TURN_CHANGED",
    ]);
    expect(result.state.stateVersion).toBe(12);
    expect(result.state.turnNumber).toBe(8);
    expect(result.state.currentTurnPlayerId).toBe(playerB);
  });

  it("keeps the attacker at origin when a defense stance defender survives", () => {
    const state = baseState({
      units: [
        unit({ id: "attacker", ownerId: playerA, position: { row: 4, col: 3 }, baseAttack: 1000, currentDefense: 2500, stance: "attack" }),
        unit({ id: "enemy", ownerId: playerB, position: { row: 4, col: 5 }, baseAttack: 2000, currentDefense: 3000, stance: "defense" }),
      ],
    });
    const result = runMove(state, action({ destination: { row: 4, col: 5 }, nextStance: "defense" }));

    expect(getUnit(result.state, "attacker").position).toEqual({ row: 4, col: 3 });
    expect(getUnit(result.state, "attacker").stance).toBe("defense");
    expect(getUnit(result.state, "enemy").currentDefense).toBe(2000);
    expect(eventTypes(result.events)).toEqual([
      "UNIT_REVEALED",
      "UNIT_REVEALED",
      "COMBAT_RESOLVED",
      "DEFENSE_CHANGED",
      "TURN_CHANGED",
    ]);
  });

  it("preserves defeated attacker stance from combat result when the attacker is destroyed", () => {
    const state = baseState({
      units: [
        unit({ id: "attacker", ownerId: playerA, position: { row: 4, col: 3 }, baseAttack: 1000, currentDefense: 1000, stance: "attack" }),
        unit({ id: "enemy", ownerId: playerB, position: { row: 4, col: 5 }, baseAttack: 3000, currentDefense: 3000, stance: "attack" }),
        unit({ id: "ally", ownerId: playerA, position: { row: 6, col: 0 } }),
        unit({ id: "enemy-backup", ownerId: playerB, position: { row: 6, col: 6 } }),
      ],
    });
    const result = runMove(state, action({ destination: { row: 4, col: 5 }, nextStance: "defense" }));
    const attacker = getUnit(result.state, "attacker");

    expect(attacker.status).toBe("defeated");
    expect(attacker.position).toBeNull();
    expect(attacker.stance).toBe("attack");
    expect(getUnit(result.state, "enemy").status).toBe("board");
  });

  it("reflects both defeated and avoids duplicate reveal events when visibilities already exist", () => {
    const state = baseState({
      units: [
        unit({ id: "attacker", ownerId: playerA, position: { row: 4, col: 3 }, baseAttack: 2000, currentDefense: 1000 }),
        unit({ id: "enemy", ownerId: playerB, position: { row: 4, col: 5 }, baseAttack: 2000, currentDefense: 3000, stance: "attack" }),
        unit({ id: "ally", ownerId: playerA, position: { row: 6, col: 0 } }),
        unit({ id: "enemy-backup", ownerId: playerB, position: { row: 6, col: 6 } }),
      ],
      unitVisibilities: [
        { unitId: toUnitId("attacker"), viewerId: playerB, level: "revealed" },
        { unitId: toUnitId("enemy"), viewerId: playerA, level: "revealed" },
      ],
    });
    const result = runMove(state, action({ destination: { row: 4, col: 5 } }));

    expect(getUnit(result.state, "attacker").status).toBe("defeated");
    expect(getUnit(result.state, "enemy").status).toBe("defeated");
    expect(eventTypes(result.events)).toEqual([
      "COMBAT_RESOLVED",
      "DEFENSE_CHANGED",
      "DEFENSE_CHANGED",
      "UNIT_DEFEATED",
      "UNIT_DEFEATED",
      "TURN_CHANGED",
    ]);
  });
});

describe("applyMoveUnitAction victory and determinism", () => {
  it("finishes by annihilation when combat defeats the opponent's final unit", () => {
    const state = baseState({
      units: [
        unit({ id: "attacker", ownerId: playerA, position: { row: 4, col: 3 }, baseAttack: 3000, currentDefense: 2500 }),
        unit({ id: "enemy", ownerId: playerB, position: { row: 4, col: 5 }, baseAttack: 1000, currentDefense: 1000, stance: "attack" }),
      ],
    });
    const result = runMove(state, action({ destination: { row: 4, col: 5 } }));

    expect(result.state.phase).toBe("finished");
    expect(result.state.winnerPlayerId).toBe(playerA);
    expect(result.state.winReason).toBe("annihilation");
    expect(result.state.currentTurnPlayerId).toBeNull();
    expect(result.state.stateVersion).toBe(12);
    expect(result.events.at(-1)).toEqual({
      type: "MATCH_FINISHED",
      winnerPlayerId: playerA,
      loserPlayerId: playerB,
      reason: "annihilation",
    });
    expect(eventTypes(result.events)).not.toContain("TURN_CHANGED");
  });

  it("does not finish when the opponent still has a reserve unit", () => {
    const state = baseState({
      units: [
        unit({ id: "attacker", ownerId: playerA, position: { row: 4, col: 3 }, baseAttack: 3000, currentDefense: 2500 }),
        unit({ id: "enemy", ownerId: playerB, position: { row: 4, col: 5 }, baseAttack: 1000, currentDefense: 1000, stance: "attack" }),
        unit({ id: "enemy-reserve", ownerId: playerB, position: null, status: "reserve" }),
      ],
    });
    const result = runMove(state, action({ destination: { row: 4, col: 5 } }));

    expect(result.state.phase).toBe("active");
    expect(result.state.winnerPlayerId).toBeNull();
    expect(result.state.currentTurnPlayerId).toBe(playerB);
    expect(eventTypes(result.events).at(-1)).toBe("TURN_CHANGED");
  });

  it("returns the same state and events for the same input and increments stateVersion only once", () => {
    const state = baseState();
    const moveAction = action({ destination: { row: 3, col: 3 } });
    const first = runMove(state, moveAction);
    const second = runMove(state, moveAction);

    expect(first).toEqual(second);
    expect(first.state.stateVersion).toBe(state.stateVersion + 1);
    expect(eventTypes(first.events)).toEqual(eventTypes(second.events));
  });

  it("selects the enemy at destination regardless of units array order", () => {
    const unorderedUnits = [
      unit({ id: "enemy-backup", ownerId: playerB, position: { row: 6, col: 6 } }),
      unit({ id: "enemy", ownerId: playerB, position: { row: 4, col: 5 }, baseAttack: 1000, currentDefense: 1000 }),
      unit({ id: "attacker", ownerId: playerA, position: { row: 4, col: 3 }, baseAttack: 3000, currentDefense: 2500 }),
      unit({ id: "ally", ownerId: playerA, position: { row: 6, col: 0 } }),
    ];
    const result = runMove(baseState({ units: unorderedUnits }), action({ destination: { row: 4, col: 5 } }));

    expect(result.state.units.map((stateUnit) => stateUnit.id)).toEqual(
      unorderedUnits.map((stateUnit) => stateUnit.id),
    );
    expect(getUnit(result.state, "enemy").status).toBe("defeated");
    expect(getUnit(result.state, "enemy-backup").status).toBe("board");
  });

  it("does not mutate input units, visibilities, action, or config", () => {
    const state = baseState({
      unitVisibilities: [{ unitId: toUnitId("other"), viewerId: playerA, level: "hidden" }],
    });
    const moveAction = action({ destination: { row: 3, col: 3 } });
    const snapshots = {
      state: cloneJson(state),
      units: cloneJson(state.units),
      unit: cloneJson(getUnit(state, "attacker")),
      visibilities: cloneJson(state.unitVisibilities),
      action: cloneJson(moveAction),
      config: cloneJson(config),
    };

    runMove(state, moveAction);

    expect(cloneJson(state)).toBe(snapshots.state);
    expect(cloneJson(state.units)).toBe(snapshots.units);
    expect(cloneJson(getUnit(state, "attacker"))).toBe(snapshots.unit);
    expect(cloneJson(state.unitVisibilities)).toBe(snapshots.visibilities);
    expect(cloneJson(moveAction)).toBe(snapshots.action);
    expect(cloneJson(config)).toBe(snapshots.config);
  });
});
