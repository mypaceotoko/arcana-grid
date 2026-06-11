import { describe, expect, it } from "vitest";

import {
  TACTICAL_DUEL_RULE_CONFIG,
  applyAttackFlagAction,
  applyTacticalDuelAction,
  buildPlayerMatchView,
  toActionId,
  toCardId,
  toCharacterId,
  toMatchId,
  toMatchPlayerId,
  toPlayerId,
  toUnitId,
} from "../../../src/game";
import type {
  AttackFlagAction,
  CardSnapshot,
  GameEventPayload,
  MatchPlayerState,
  MatchState,
  MovementRule,
  Result,
  RuleError,
  Stance,
  TacticalDuelActionResult,
  TacticalRuleConfig,
  UnitState,
  UnitVisibility,
} from "../../../src/game";

const matchId = toMatchId("match-flag-attack");
const playerA = toMatchPlayerId("player-a");
const playerB = toMatchPlayerId("player-b");
const outsider = toMatchPlayerId("outsider");
const config: TacticalRuleConfig = TACTICAL_DUEL_RULE_CONFIG;

const orthogonalRule: MovementRule = {
  kind: "line",
  directions: [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ],
  maxDistance: null,
};

const diagonalRule: MovementRule = {
  kind: "line",
  directions: [
    { row: -1, col: -1 },
    { row: -1, col: 1 },
    { row: 1, col: -1 },
    { row: 1, col: 1 },
  ],
  maxDistance: null,
};

const adjacentRule: MovementRule = {
  kind: "offset",
  offsets: [
    { row: -1, col: -1 },
    { row: -1, col: 0 },
    { row: -1, col: 1 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
    { row: 1, col: -1 },
    { row: 1, col: 0 },
    { row: 1, col: 1 },
  ],
  canJump: true,
};

const specialRule: MovementRule = {
  kind: "offset",
  offsets: [{ row: -2, col: 1 }],
  canJump: true,
};

const card = (key: string, movementRule: MovementRule = orthogonalRule): CardSnapshot => ({
  cardId: toCardId(`card-${key}`),
  characterId: toCharacterId(`character-${key}`),
  characterKey: `character-${key}`,
  cardKey: `card-${key}`,
  cardName: `Secret Card ${key}`,
  movementType: movementRule.kind === "offset" ? "special_offset" : "orthogonal",
  movementRule,
  baseAttack: 2100,
  baseDefense: 2600,
  attribute: "neutral",
  rarity: "legendary",
  artworkUrl: `https://example.test/${key}.png`,
  abilityData: { secret: key },
});

const player = (
  id: MatchPlayerState["id"],
  side: MatchPlayerState["side"],
  damage = 0,
): MatchPlayerState => ({
  id,
  playerId: toPlayerId(`account-${id}`),
  side,
  reserveUnitIds: [],
  setupSubmitted: true,
  flag: { ownerId: id, damage, maxDamage: 3 },
  connected: true,
});

const unit = ({
  id,
  ownerId,
  position,
  status = "board",
  stance = "attack",
  currentDefense = 2600,
  movementRule = orthogonalRule,
}: {
  id: string;
  ownerId: UnitState["ownerId"];
  position: UnitState["position"];
  status?: UnitState["status"];
  stance?: Stance;
  currentDefense?: number;
  movementRule?: MovementRule;
}): UnitState => ({
  id: toUnitId(id),
  ownerId,
  card: card(id, movementRule),
  status,
  position,
  stance,
  currentDefense,
});

const visibilities = (): UnitVisibility[] => [
  { unitId: toUnitId("attacker"), viewerId: playerB, level: "hidden" },
];

const baseState = (overrides: Partial<MatchState> = {}): MatchState => ({
  id: matchId,
  gameMode: "tactical_duel",
  rulesVersion: config.rulesVersion,
  boardSize: { width: 8, height: 8 },
  phase: "active",
  players: [player(playerA, "south"), player(playerB, "north")],
  units: [
    unit({ id: "attacker", ownerId: playerA, position: { row: 1, col: 3 } }),
    unit({ id: "ally", ownerId: playerA, position: { row: 6, col: 0 } }),
    unit({ id: "enemy", ownerId: playerB, position: { row: 2, col: 7 } }),
  ],
  unitVisibilities: visibilities(),
  currentTurnPlayerId: playerA,
  turnNumber: 5,
  stateVersion: 10,
  winnerPlayerId: null,
  winReason: null,
  ...overrides,
});

const action = (overrides: Partial<AttackFlagAction> = {}): AttackFlagAction => ({
  type: "ATTACK_FLAG",
  actionId: toActionId("attack-flag-1"),
  matchId,
  actorId: playerA,
  unitId: toUnitId("attacker"),
  target: { row: 0, col: 3 },
  nextStance: "defense",
  expectedStateVersion: 10,
  ...overrides,
});

const unwrap = <T>(result: Result<T, RuleError>): T => {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
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

const run = (
  state: MatchState = baseState(),
  attackAction: AttackFlagAction = action(),
): TacticalDuelActionResult =>
  unwrap(applyAttackFlagAction({ state, action: attackAction, config }));

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

const getPlayer = (state: MatchState, id: MatchPlayerState["id"]): MatchPlayerState => {
  const found = state.players.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`Player ${id} not found.`);
  }
  return found;
};

describe("applyAttackFlagAction validation", () => {
  const invalidStance = "guard" as Stance;

  it.each<readonly [string, MatchState, AttackFlagAction, RuleError["code"]]>([
    ["matchId mismatch", baseState(), action({ matchId: toMatchId("other") }), "MATCH_ID_MISMATCH"],
    ["unsupported game mode", baseState({ gameMode: "territory_battle" as MatchState["gameMode"] }), action(), "UNSUPPORTED_GAME_MODE"],
    ["setup phase", baseState({ phase: "setup" }), action(), "INVALID_PHASE"],
    ["finished phase", baseState({ phase: "finished", winnerPlayerId: playerA, winReason: "flag_destroyed" }), action(), "MATCH_FINISHED"],
    ["winner set", baseState({ winnerPlayerId: playerA }), action(), "MATCH_FINISHED"],
    ["win reason set", baseState({ winReason: "annihilation" }), action(), "MATCH_FINISHED"],
    ["missing current turn", baseState({ currentTurnPlayerId: null }), action(), "CURRENT_TURN_PLAYER_MISSING"],
    ["opponent turn", baseState({ currentTurnPlayerId: playerB }), action(), "NOT_YOUR_TURN"],
    ["stale state", baseState(), action({ expectedStateVersion: 9 }), "STALE_STATE_VERSION"],
    ["actor outside players", baseState(), action({ actorId: outsider }), "NOT_YOUR_TURN"],
    ["invalid player count", baseState({ players: [player(playerA, "south")] }), action(), "INVALID_PLAYER_COUNT"],
    ["duplicate players", baseState({ players: [player(playerA, "south"), player(playerA, "north")] }), action(), "DUPLICATE_MATCH_PLAYER"],
    ["unit not found", baseState(), action({ unitId: toUnitId("missing") }), "UNIT_NOT_FOUND"],
    ["duplicate unit", baseState({ units: [...baseState().units, { ...getUnit(baseState(), "attacker") }] }), action(), "DUPLICATE_UNIT"],
    ["unit not owned", baseState({ units: [unit({ id: "attacker", ownerId: playerB, position: { row: 1, col: 3 } }), unit({ id: "ally", ownerId: playerA, position: { row: 6, col: 0 } })] }), action(), "UNIT_NOT_OWNED"],
    ["reserve unit", baseState({ units: [unit({ id: "attacker", ownerId: playerA, status: "reserve", position: null }), unit({ id: "enemy", ownerId: playerB, position: { row: 2, col: 7 } })] }), action(), "UNIT_NOT_ON_BOARD"],
    ["defeated unit", baseState({ units: [unit({ id: "attacker", ownerId: playerA, status: "defeated", position: null }), unit({ id: "enemy", ownerId: playerB, position: { row: 2, col: 7 } })] }), action(), "UNIT_DEFEATED"],
    ["board unit without position", baseState({ units: [unit({ id: "attacker", ownerId: playerA, position: null }), unit({ id: "enemy", ownerId: playerB, position: { row: 2, col: 7 } })] }), action(), "UNIT_NOT_ON_BOARD"],
    ["invalid nextStance", baseState(), action({ nextStance: invalidStance }), "INVALID_ACTION"],
  ])("rejects %s", (_name, state, attackAction, code) => {
    const before = cloneJson(state);
    expectErrorCode(applyAttackFlagAction({ state, action: attackAction, config }), code);
    expect(cloneJson(state)).toBe(before);
  });
});

describe("applyAttackFlagAction target and movement", () => {
  it("attacks either coordinate in the opponent flag area", () => {
    const left = run(baseState(), action({ target: { row: 0, col: 3 } }));
    const rightState = baseState({
      units: [
        unit({ id: "attacker", ownerId: playerA, position: { row: 1, col: 4 } }),
        unit({ id: "enemy", ownerId: playerB, position: { row: 2, col: 7 } }),
      ],
    });
    const right = run(rightState, action({ target: { row: 0, col: 4 } }));

    expect(getPlayer(left.state, playerB).flag.damage).toBe(1);
    expect(getPlayer(right.state, playerB).flag.damage).toBe(1);
  });

  it.each<readonly [string, MatchState, AttackFlagAction, RuleError["code"]]>([
    ["own flag area", baseState({ units: [unit({ id: "attacker", ownerId: playerA, position: { row: 6, col: 3 } }), unit({ id: "enemy", ownerId: playerB, position: { row: 2, col: 7 } })] }), action({ target: { row: 7, col: 3 } }), "TARGET_NOT_OPPONENT_FLAG"],
    ["outside flag area", baseState(), action({ target: { row: 1, col: 3 } }), "TARGET_NOT_OPPONENT_FLAG"],
    ["off board", baseState(), action({ target: { row: -1, col: 3 } }), "OUT_OF_BOUNDS"],
    ["occupied flag area", baseState({ units: [...baseState().units, unit({ id: "illegal", ownerId: playerB, position: { row: 0, col: 3 } })] }), action(), "FLAG_AREA_OCCUPIED"],
    ["range blocked by enemy", baseState({ units: [unit({ id: "attacker", ownerId: playerA, position: { row: 3, col: 3 } }), unit({ id: "blocker", ownerId: playerB, position: { row: 2, col: 3 } }), unit({ id: "enemy", ownerId: playerB, position: { row: 2, col: 7 } })] }), action(), "FLAG_ATTACK_NOT_LEGAL"],
    ["outside legal range", baseState({ units: [unit({ id: "attacker", ownerId: playerA, position: { row: 2, col: 3 }, movementRule: adjacentRule }), unit({ id: "enemy", ownerId: playerB, position: { row: 2, col: 7 } })] }), action(), "FLAG_ATTACK_NOT_LEGAL"],
  ])("rejects %s", (_name, state, attackAction, code) => {
    expectErrorCode(applyAttackFlagAction({ state, action: attackAction, config }), code);
  });

  it("uses line, diagonal, adjacent, and special-offset legal moves as flag attack range", () => {
    const diagonal = run(
      baseState({
        units: [
          unit({ id: "attacker", ownerId: playerA, position: { row: 1, col: 2 }, movementRule: diagonalRule }),
          unit({ id: "enemy", ownerId: playerB, position: { row: 2, col: 7 } }),
        ],
      }),
    );
    const adjacent = run(
      baseState({
        units: [
          unit({ id: "attacker", ownerId: playerA, position: { row: 1, col: 4 }, movementRule: adjacentRule }),
          unit({ id: "enemy", ownerId: playerB, position: { row: 2, col: 7 } }),
        ],
      }),
      action({ target: { row: 0, col: 4 } }),
    );
    const special = run(
      baseState({
        units: [
          unit({ id: "attacker", ownerId: playerA, position: { row: 2, col: 2 }, movementRule: specialRule }),
          unit({ id: "enemy", ownerId: playerB, position: { row: 2, col: 7 } }),
        ],
      }),
    );

    expect(getPlayer(diagonal.state, playerB).flag.damage).toBe(1);
    expect(getPlayer(adjacent.state, playerB).flag.damage).toBe(1);
    expect(getPlayer(special.state, playerB).flag.damage).toBe(1);
  });
});

describe("applyAttackFlagAction state transition and events", () => {
  it("damages the opponent flag, reveals the attacker, keeps position, updates stance, advances turn, and emits deterministic non-secret events", () => {
    const state = baseState();
    const before = cloneJson(state);
    const result = run(state);
    const attacker = getUnit(result.state, "attacker");
    const originalAttacker = getUnit(state, "attacker");

    expect(cloneJson(state)).toBe(before);
    expect(attacker).not.toBe(originalAttacker);
    expect(attacker.position).toEqual({ row: 1, col: 3 });
    expect(attacker.status).toBe("board");
    expect(attacker.stance).toBe("defense");
    expect(attacker.currentDefense).toBe(originalAttacker.currentDefense);
    expect(attacker.card).toBe(originalAttacker.card);
    expect(getPlayer(result.state, playerA).flag.damage).toBe(0);
    expect(getPlayer(result.state, playerB).flag.damage).toBe(1);
    expect(result.state.phase).toBe("active");
    expect(result.state.currentTurnPlayerId).toBe(playerB);
    expect(result.state.turnNumber).toBe(6);
    expect(result.state.stateVersion).toBe(11);
    expect(result.state.winnerPlayerId).toBeNull();
    expect(result.state.winReason).toBeNull();
    expect(eventTypes(result.events)).toEqual([
      "UNIT_REVEALED",
      "FLAG_ATTACKED",
      "FLAG_DAMAGED",
      "TURN_CHANGED",
    ]);
    expect(result.events[1]).toEqual({
      type: "FLAG_ATTACKED",
      attackerUnitId: toUnitId("attacker"),
      attackerPlayerId: playerA,
      defenderPlayerId: playerB,
      target: { row: 0, col: 3 },
    });
    expect(result.events[2]).toEqual({
      type: "FLAG_DAMAGED",
      ownerId: playerB,
      previousDamage: 0,
      damage: 1,
      appliedDamage: 1,
      maxDamage: 3,
    });
    expect(JSON.stringify(result.events[1])).not.toContain("Secret Card");
    expect(JSON.stringify(result.events[1])).not.toContain("baseAttack");
    expect(JSON.stringify(result.events[1])).not.toContain("baseDefense");
    expect(JSON.stringify(result.events[1])).not.toContain("abilityData");
    expect(JSON.stringify(result.events[1])).not.toContain("artworkUrl");
  });

  it("does not emit a duplicate reveal event when already revealed and makes the unit visible in player views", () => {
    const state = baseState({
      unitVisibilities: [
        { unitId: toUnitId("attacker"), viewerId: playerB, level: "revealed" },
      ],
    });
    const result = run(state);
    const view = unwrap(
      buildPlayerMatchView({
        state: result.state,
        viewerId: playerB,
        cardBackKey: "back",
      }),
    );
    const attackerView = view.units.find((candidate) => candidate.unitId === toUnitId("attacker"));

    expect(eventTypes(result.events)).toEqual([
      "FLAG_ATTACKED",
      "FLAG_DAMAGED",
      "TURN_CHANGED",
    ]);
    expect(attackerView?.revealed).toBe(true);
    expect(result.state.unitVisibilities).toEqual(state.unitVisibilities);
  });

  it("finishes the match without changing turns when the opponent flag reaches maximum damage", () => {
    const state = baseState({ players: [player(playerA, "south"), player(playerB, "north", 2)] });
    const result = run(state);

    expect(getPlayer(result.state, playerB).flag.damage).toBe(3);
    expect(result.state.phase).toBe("finished");
    expect(result.state.winnerPlayerId).toBe(playerA);
    expect(result.state.winReason).toBe("flag_destroyed");
    expect(result.state.currentTurnPlayerId).toBeNull();
    expect(result.state.turnNumber).toBe(5);
    expect(result.state.stateVersion).toBe(11);
    expect(eventTypes(result.events)).toEqual([
      "UNIT_REVEALED",
      "FLAG_ATTACKED",
      "FLAG_DAMAGED",
      "MATCH_FINISHED",
    ]);
    expect(result.events.at(-1)).toEqual({
      type: "MATCH_FINISHED",
      winnerPlayerId: playerA,
      loserPlayerId: playerB,
      reason: "flag_destroyed",
    });
  });

  it("rejects active states whose opponent flag is already at maximum damage", () => {
    const state = baseState({ players: [player(playerA, "south"), player(playerB, "north", 3)] });
    const before = cloneJson(state);

    expectErrorCode(applyAttackFlagAction({ state, action: action(), config }), "FLAG_ALREADY_DESTROYED");
    expect(cloneJson(state)).toBe(before);
  });

  it("is deterministic across repeated calls and independent of player/unit order", () => {
    const reordered = baseState({
      players: [player(playerB, "north", 2), player(playerA, "south")],
      units: [...baseState().units].reverse(),
      unitVisibilities: [...visibilities()].reverse(),
    });
    const first = run(reordered);
    const second = run(reordered);

    expect(first).toEqual(second);
    expect(first.state.winnerPlayerId).toBe(playerA);
    expect(getUnit(first.state, "attacker").stance).toBe("defense");
    expect(getPlayer(first.state, playerB).flag.damage).toBe(3);
    expect(first.state.stateVersion).toBe(11);
  });
});

describe("applyTacticalDuelAction ATTACK_FLAG branch", () => {
  it("routes ATTACK_FLAG and keeps unsupported actions rejected", () => {
    const routed = unwrap(
      applyTacticalDuelAction({ state: baseState(), action: action(), config }),
    );

    expect(getPlayer(routed.state, playerB).flag.damage).toBe(1);
    expectErrorCode(
      applyTacticalDuelAction({
        state: baseState(),
        action: { type: "UNSUPPORTED_ACTION" },
        config,
      }),
      "UNSUPPORTED_ACTION",
    );
  });
});
