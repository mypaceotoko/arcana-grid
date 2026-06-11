import { describe, expect, it } from "vitest";

import {
  TACTICAL_DUEL_RULE_CONFIG,
  applyConcedeMatchAction,
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
  ConcedeMatchAction,
  GameEventPayload,
  MatchPlayerState,
  MatchState,
  Result,
  RuleError,
  Stance,
  TacticalDuelActionResult,
  TacticalRuleConfig,
  UnitState,
  UnitVisibility,
} from "../../../src/game";

const matchId = toMatchId("match-concede");
const playerA = toMatchPlayerId("player-a");
const playerB = toMatchPlayerId("player-b");
const outsider = toMatchPlayerId("outsider");
const config: TacticalRuleConfig = TACTICAL_DUEL_RULE_CONFIG;

const card = (key: string): CardSnapshot => ({
  cardId: toCardId(`card-${key}`),
  characterId: toCharacterId(`character-${key}`),
  characterKey: `character-${key}`,
  cardKey: `card-${key}`,
  cardName: `Secret Card ${key}`,
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
  baseAttack: 1700,
  baseDefense: 2400,
  attribute: "neutral",
  rarity: "legendary",
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
  reserveUnitIds: [toUnitId(`${id}-reserve`)],
  setupSubmitted: true,
  flag: { ownerId: id, damage: 1, maxDamage: 3 },
  connected: true,
});

const unit = ({
  id,
  ownerId,
  status = "board",
  position = status === "board" ? { row: 4, col: 0 } : null,
  stance = "defense",
  currentDefense = status === "defeated" ? 0 : 2400,
}: {
  id: string;
  ownerId: UnitState["ownerId"];
  status?: UnitState["status"];
  position?: UnitState["position"];
  stance?: Stance;
  currentDefense?: number;
}): UnitState => ({
  id: toUnitId(id),
  ownerId,
  card: card(id),
  status,
  position,
  stance,
  currentDefense,
});

const visibilities = (): UnitVisibility[] => [
  { unitId: toUnitId("a-board"), viewerId: playerA, level: "owner_full" },
  { unitId: toUnitId("a-board"), viewerId: playerB, level: "hidden" },
];

const baseState = (overrides: Partial<MatchState> = {}): MatchState => ({
  id: matchId,
  gameMode: "tactical_duel",
  rulesVersion: config.rulesVersion,
  boardSize: { width: 8, height: 8 },
  phase: "active",
  players: [player(playerA, "south"), player(playerB, "north")],
  units: [
    unit({
      id: "a-board",
      ownerId: playerA,
      position: { row: 6, col: 0 },
      stance: "attack",
    }),
    unit({
      id: "a-reserve",
      ownerId: playerA,
      status: "reserve",
      currentDefense: 1,
    }),
    unit({
      id: "a-defeated",
      ownerId: playerA,
      status: "defeated",
      position: null,
    }),
    unit({ id: "b-board", ownerId: playerB, position: { row: 1, col: 0 } }),
  ],
  unitVisibilities: visibilities(),
  currentTurnPlayerId: playerA,
  turnNumber: 7,
  stateVersion: 11,
  winnerPlayerId: null,
  winReason: null,
  ...overrides,
});

const action = (
  overrides: Partial<ConcedeMatchAction> = {},
): ConcedeMatchAction => ({
  type: "CONCEDE_MATCH",
  actionId: toActionId("concede-1"),
  matchId,
  actorId: playerA,
  expectedStateVersion: 11,
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
): void => {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe(code);
  }
};

const runConcede = (
  state: MatchState = baseState(),
  concedeAction: ConcedeMatchAction = action(),
): TacticalDuelActionResult =>
  unwrap(applyConcedeMatchAction({ state, action: concedeAction, config }));

const eventTypes = (events: readonly GameEventPayload[]): readonly string[] =>
  events.map((event) => event.type);

const json = (value: unknown): string => JSON.stringify(value);

const expectConcessionSuccess = (
  state: MatchState,
  concedeAction: ConcedeMatchAction,
  winnerPlayerId: MatchPlayerState["id"],
): TacticalDuelActionResult => {
  const before = json(state);
  const actionBefore = json(concedeAction);
  const configBefore = json(config);
  const result = runConcede(state, concedeAction);

  expect(result.state).not.toBe(state);
  expect(result.state.phase).toBe("finished");
  expect(result.state.currentTurnPlayerId).toBeNull();
  expect(result.state.winnerPlayerId).toBe(winnerPlayerId);
  expect(result.state.winReason).toBe("concession");
  expect(result.state.stateVersion).toBe(state.stateVersion + 1);
  expect(result.state.turnNumber).toBe(state.turnNumber);
  expect(result.state.players).toBe(state.players);
  expect(result.state.units).toBe(state.units);
  expect(result.state.unitVisibilities).toBe(state.unitVisibilities);
  expect(result.events).toEqual([
    {
      type: "MATCH_CONCEDED",
      concedingPlayerId: concedeAction.actorId,
      winnerPlayerId,
    },
    {
      type: "MATCH_FINISHED",
      winnerPlayerId,
      loserPlayerId: concedeAction.actorId,
      reason: "concession",
    },
  ]);
  expect(eventTypes(result.events)).not.toContain("TURN_CHANGED");
  expect(eventTypes(result.events)).not.toContain("UNIT_DEFEATED");
  expect(eventTypes(result.events)).not.toContain("FLAG_DAMAGED");
  expect(json(state)).toBe(before);
  expect(json(concedeAction)).toBe(actionBefore);
  expect(json(config)).toBe(configBefore);

  return result;
};

describe("applyTacticalDuelAction concede branch", () => {
  it("dispatches CONCEDE_MATCH and rejects explicitly unsupported actions", () => {
    expectConcessionSuccess(baseState(), action(), playerB);

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

describe("applyConcedeMatchAction success", () => {
  it("finishes the match with the opponent as winner for either player and either side", () => {
    expectConcessionSuccess(baseState(), action({ actorId: playerA }), playerB);
    expectConcessionSuccess(
      baseState({ currentTurnPlayerId: playerB }),
      action({ actorId: playerB }),
      playerA,
    );

    const swappedSides = baseState({
      players: [player(playerA, "north"), player(playerB, "south")],
    });
    expectConcessionSuccess(
      swappedSides,
      action({ actorId: playerA }),
      playerB,
    );
    expectConcessionSuccess(
      swappedSides,
      action({ actorId: playerB }),
      playerA,
    );
  });

  it("allows concession during either player's turn without using currentTurnPlayerId as winner", () => {
    expectConcessionSuccess(
      baseState({ currentTurnPlayerId: playerA }),
      action({ actorId: playerA }),
      playerB,
    );
    expectConcessionSuccess(
      baseState({ currentTurnPlayerId: playerB }),
      action({ actorId: playerA }),
      playerB,
    );
  });

  it("is independent of player ordering and deterministic for repeated input", () => {
    const reversed = baseState({
      players: [player(playerB, "north"), player(playerA, "south")],
      currentTurnPlayerId: playerB,
    });
    const first = expectConcessionSuccess(
      reversed,
      action({ actorId: playerA }),
      playerB,
    );
    const second = expectConcessionSuccess(
      reversed,
      action({ actorId: playerA }),
      playerB,
    );

    expect(first).toEqual(second);
    expect(eventTypes(first.events)).toEqual([
      "MATCH_CONCEDED",
      "MATCH_FINISHED",
    ]);
    expect(first.state.stateVersion).toBe(reversed.stateVersion + 1);
  });
});

describe("applyConcedeMatchAction validation", () => {
  it("requires active unfinished tactical duel state with current turn and matching version", () => {
    expectErrorCode(runError(baseState({ phase: "setup" })), "INVALID_PHASE");
    expectErrorCode(
      runError(baseState({ phase: "finished" })),
      "MATCH_FINISHED",
    );
    expectErrorCode(
      runError(baseState({ winnerPlayerId: playerB })),
      "MATCH_FINISHED",
    );
    expectErrorCode(
      runError(baseState({ winReason: "annihilation" })),
      "MATCH_FINISHED",
    );
    expectErrorCode(
      runError(baseState({ currentTurnPlayerId: null })),
      "CURRENT_TURN_PLAYER_MISSING",
    );
    expectErrorCode(
      runError(baseState(), action({ expectedStateVersion: 10 })),
      "STALE_STATE_VERSION",
    );
  });

  it("validates match id, game mode, player count, duplicate players, actor, and opponent", () => {
    expectErrorCode(
      runError(baseState(), action({ matchId: toMatchId("other-match") })),
      "MATCH_ID_MISMATCH",
    );
    expectErrorCode(
      runError(
        baseState({ gameMode: "territory_battle" as MatchState["gameMode"] }),
      ),
      "UNSUPPORTED_GAME_MODE",
    );
    expectErrorCode(
      runError(baseState({ players: [] })),
      "INVALID_PLAYER_COUNT",
    );
    expectErrorCode(
      runError(baseState({ players: [player(playerA, "south")] })),
      "INVALID_PLAYER_COUNT",
    );
    expectErrorCode(
      runError({
        ...baseState(),
        players: [
          player(playerA, "south"),
          player(playerB, "north"),
          player(outsider, "north"),
        ],
      }),
      "INVALID_PLAYER_COUNT",
    );
    expectErrorCode(
      runError(
        baseState({
          players: [player(playerA, "south"), player(playerA, "north")],
        }),
      ),
      "DUPLICATE_MATCH_PLAYER",
    );
    expectErrorCode(
      runError(baseState(), action({ actorId: outsider })),
      "MATCH_PLAYER_NOT_FOUND",
    );
  });
});

describe("applyConcedeMatchAction preservation and secrecy", () => {
  it("preserves units, flags, visibilities, setup flags, and does not leak unit/card details in events", () => {
    const state = baseState();
    const result = expectConcessionSuccess(state, action(), playerB);

    expect(result.state.units).toBe(state.units);
    expect(result.state.players[0].flag.damage).toBe(
      state.players[0].flag.damage,
    );
    expect(result.state.players[1].flag.damage).toBe(
      state.players[1].flag.damage,
    );
    expect(result.state.players[0].setupSubmitted).toBe(true);
    expect(result.state.units.map((candidate) => candidate.status)).toEqual(
      state.units.map((candidate) => candidate.status),
    );
    expect(
      result.state.units.map((candidate) => candidate.currentDefense),
    ).toEqual(state.units.map((candidate) => candidate.currentDefense));
    expect(result.state.units.map((candidate) => candidate.position)).toEqual(
      state.units.map((candidate) => candidate.position),
    );
    expect(result.state.units.map((candidate) => candidate.stance)).toEqual(
      state.units.map((candidate) => candidate.stance),
    );

    const serializedEvents = json(result.events);
    for (const secret of [
      "unitId",
      "Secret Card",
      "cardName",
      "movementType",
      "baseAttack",
      "baseDefense",
      "currentDefense",
      "stance",
      "position",
      "reserveUnitIds",
      "visibility",
      "artworkUrl",
      "abilityData",
      "rarity",
    ]) {
      expect(serializedEvents).not.toContain(secret);
    }
  });
});

const runError = (
  state: MatchState,
  concedeAction: ConcedeMatchAction = action(),
): Result<TacticalDuelActionResult, RuleError> =>
  applyConcedeMatchAction({ state, action: concedeAction, config });
