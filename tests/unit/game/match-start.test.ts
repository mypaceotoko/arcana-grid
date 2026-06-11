import { describe, expect, it, vi } from "vitest";
import {
  startTacticalDuelMatch,
  TACTICAL_DUEL_RULE_CONFIG,
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
  MatchPlayerId,
  MatchPlayerState,
  MatchState,
  PlayerSide,
  Result,
  RuleError,
  Stance,
  TacticalRuleConfig,
  UnitId,
  UnitState,
  UnitVisibility,
} from "../../../src/game";

const matchId = toMatchId("match-start-test");
const northId = toMatchPlayerId("north-player");
const southId = toMatchPlayerId("south-player");
const outsiderId = toMatchPlayerId("outsider-player");
const baseConfig = TACTICAL_DUEL_RULE_CONFIG;

type StateOverrides = Partial<MatchState>;

const card = (key: string, baseDefense = 1000): CardSnapshot => ({
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
  baseAttack: 999,
  baseDefense,
  attribute: "neutral",
  rarity: "secret_rare",
  artworkUrl: `https://example.test/secret-${key}.png`,
  abilityData: { secret: `ability-${key}` },
});

const player = (
  id: MatchPlayerId,
  side: PlayerSide,
  reserveUnitIds: readonly UnitId[],
  setupSubmitted = true,
): MatchPlayerState => ({
  id,
  playerId: toPlayerId(`account-${id}`),
  side,
  reserveUnitIds: [...reserveUnitIds],
  setupSubmitted,
  flag: { ownerId: id, damage: 0, maxDamage: baseConfig.flagMaxDamage },
  connected: true,
});

const placementPositions = (
  side: PlayerSide,
  count: number,
  config: TacticalRuleConfig,
): { row: number; col: number }[] => {
  const rowStart = side === "north" ? 0 : config.boardHeight - config.initialPlacementDepth;
  const centerLeft = Math.floor(config.boardWidth / 2) - 1;
  const centerRight = Math.floor(config.boardWidth / 2);
  const positions: { row: number; col: number }[] = [];

  for (let row = rowStart; row < rowStart + config.initialPlacementDepth; row += 1) {
    for (let col = 0; col < config.boardWidth; col += 1) {
      const isFlagRow = side === "north" ? row === 0 : row === config.boardHeight - 1;
      if (isFlagRow && (col === centerLeft || col === centerRight)) {
        continue;
      }
      positions.push({ row, col });
    }
  }

  return positions.slice(0, count);
};

const unit = ({
  id,
  ownerId,
  status,
  position,
  stance = "attack",
  currentDefense = 1000,
}: {
  id: string;
  ownerId: MatchPlayerId;
  status: UnitState["status"];
  position: UnitState["position"];
  stance?: UnitState["stance"];
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

const playerUnits = (
  ownerId: MatchPlayerId,
  side: PlayerSide,
  config: TacticalRuleConfig,
): { units: UnitState[]; reserveUnitIds: UnitId[] } => {
  const positions = placementPositions(side, config.initialUnitCount, config);
  const boardUnits = positions.map((position, index) =>
    unit({
      id: `${ownerId}-board-${index}`,
      ownerId,
      status: "board",
      position,
      stance: index % 2 === 0 ? "attack" : "defense",
    }),
  );
  const reserveUnits = Array.from({ length: config.reserveUnitCount }, (_, index) =>
    unit({
      id: `${ownerId}-reserve-${index}`,
      ownerId,
      status: "reserve",
      position: null,
      stance: "defense",
    }),
  );

  return {
    units: [...boardUnits, ...reserveUnits],
    reserveUnitIds: reserveUnits.map((reserve) => reserve.id),
  };
};

const createReadyState = ({
  config = baseConfig,
  overrides = {},
  unitVisibilities = [],
}: {
  config?: TacticalRuleConfig;
  overrides?: StateOverrides;
  unitVisibilities?: UnitVisibility[];
} = {}): MatchState => {
  const north = playerUnits(northId, "north", config);
  const south = playerUnits(southId, "south", config);

  const state: MatchState = {
    id: matchId,
    gameMode: "tactical_duel",
    rulesVersion: config.rulesVersion,
    boardSize: { width: config.boardWidth, height: config.boardHeight },
    phase: "setup",
    players: [
      player(northId, "north", north.reserveUnitIds),
      player(southId, "south", south.reserveUnitIds),
    ],
    units: [...north.units, ...south.units],
    unitVisibilities,
    currentTurnPlayerId: null,
    turnNumber: 0,
    stateVersion: 7,
    winnerPlayerId: null,
    winReason: null,
  };

  return { ...state, ...overrides };
};

const start = (
  state: MatchState,
  firstPlayerId: MatchPlayerId = northId,
  config: TacticalRuleConfig = baseConfig,
) =>
  startTacticalDuelMatch({
    state,
    firstPlayerId,
    expectedStateVersion: state.stateVersion,
    config,
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
    throw new Error("Expected error result.");
  }
  expect(result.error.code).toBe(code);
  return result.error;
};

const replaceUnit = (
  state: MatchState,
  targetId: UnitId,
  patch: Partial<UnitState>,
): MatchState => ({
  ...state,
  units: state.units.map((unitState) =>
    unitState.id === targetId ? { ...unitState, ...patch } : unitState,
  ),
});

const boardUnit = (state: MatchState, ownerId: MatchPlayerId, index = 0): UnitState => {
  const found = state.units.filter(
    (unitState) => unitState.ownerId === ownerId && unitState.status === "board",
  )[index];
  if (found === undefined) {
    throw new Error("board unit not found");
  }
  return found;
};

const reserveUnit = (state: MatchState, ownerId: MatchPlayerId, index = 0): UnitState => {
  const found = state.units.filter(
    (unitState) => unitState.ownerId === ownerId && unitState.status === "reserve",
  )[index];
  if (found === undefined) {
    throw new Error("reserve unit not found");
  }
  return found;
};

const json = (value: unknown): string => JSON.stringify(value);

const expectSuccessfulStart = (
  state: MatchState,
  firstPlayerId: MatchPlayerId = northId,
  config: TacticalRuleConfig = baseConfig,
) => unwrap(start(state, firstPlayerId, config));

describe("startTacticalDuelMatch", () => {
  it("starts a fully submitted setup match and emits only MATCH_STARTED", () => {
    const state = createReadyState();
    const result = expectSuccessfulStart(state, northId);

    expect(result.state).not.toBe(state);
    expect(result.state.phase).toBe("active");
    expect(result.state.currentTurnPlayerId).toBe(northId);
    expect(result.state.turnNumber).toBe(1);
    expect(result.state.stateVersion).toBe(state.stateVersion + 1);
    expect(result.state.winnerPlayerId).toBeNull();
    expect(result.state.winReason).toBeNull();
    expect(result.events).toEqual([
      { type: "MATCH_STARTED", firstPlayerId: northId, turnNumber: 1 },
    ] satisfies GameEventPayload[]);
    expect(result.events.some((event) => event.type === "TURN_CHANGED")).toBe(false);
  });

  it("does not add START_MATCH to client GameAction dispatch", () => {
    const state = createReadyState();
    const result = expectSuccessfulStart(state, southId);

    expect(result.events[0]).toMatchObject({ type: "MATCH_STARTED" });
    expect("actionId" in result.events[0]).toBe(false);
  });

  it("accepts north or south as explicit firstPlayerId without depending on player order", () => {
    const state = createReadyState();
    const southFirstState = { ...state, players: [...state.players].reverse() };

    expect(expectSuccessfulStart(state, northId).state.currentTurnPlayerId).toBe(northId);
    expect(expectSuccessfulStart(state, southId).state.currentTurnPlayerId).toBe(southId);
    expect(expectSuccessfulStart(southFirstState, southId).state.currentTurnPlayerId).toBe(southId);
  });

  it("rejects firstPlayerId that is not a participant", () => {
    expectErrorCode(start(createReadyState(), outsiderId), "INVALID_FIRST_PLAYER");
  });

  it("is deterministic and does not call random, time, or UUID-like generators", () => {
    const state = createReadyState();
    const randomSpy = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random must not be called");
    });
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("Date.now must not be called");
    });

    try {
      expect(start(state, southId)).toEqual(start(state, southId));
    } finally {
      randomSpy.mockRestore();
      nowSpy.mockRestore();
    }
  });

  it.each([
    ["active", "MATCH_ALREADY_STARTED"],
    ["finished", "MATCH_ALREADY_STARTED"],
    ["waiting", "INVALID_MATCH_SETUP_STATE"],
    ["aborted", "INVALID_MATCH_SETUP_STATE"],
  ] as const)("rejects %s phase", (phase, code) => {
    expectErrorCode(start(createReadyState({ overrides: { phase } })), code);
  });

  it("rejects setup state with current turn, non-zero turn, winner, or win reason", () => {
    expectErrorCode(
      start(createReadyState({ overrides: { currentTurnPlayerId: northId } })),
      "INVALID_MATCH_SETUP_STATE",
    );
    expectErrorCode(
      start(createReadyState({ overrides: { turnNumber: 2 } })),
      "INVALID_MATCH_SETUP_STATE",
    );
    expectErrorCode(
      start(createReadyState({ overrides: { winnerPlayerId: northId } })),
      "INVALID_MATCH_SETUP_STATE",
    );
    expectErrorCode(
      start(createReadyState({ overrides: { winReason: "annihilation" } })),
      "INVALID_MATCH_SETUP_STATE",
    );
  });

  it("uses expectedStateVersion for stale-state protection and increments once on success", () => {
    const state = createReadyState();

    expectErrorCode(
      startTacticalDuelMatch({
        state,
        firstPlayerId: northId,
        expectedStateVersion: state.stateVersion - 1,
        config: baseConfig,
      }),
      "STALE_STATE_VERSION",
    );
    expect(expectSuccessfulStart(state).state.stateVersion).toBe(state.stateVersion + 1);
  });

  it("rejects invalid player counts, duplicate player ids, and invalid sides", () => {
    const state = createReadyState();
    expectErrorCode(start({ ...state, players: [] }), "INVALID_PLAYER_COUNT");
    expectErrorCode(start({ ...state, players: [state.players[0]] }), "INVALID_PLAYER_COUNT");
    expectErrorCode(
      start({ ...state, players: [...state.players, player(outsiderId, "north", [])] }),
      "INVALID_PLAYER_COUNT",
    );
    expectErrorCode(
      start({ ...state, players: [{ ...state.players[0] }, { ...state.players[1], id: northId }] }),
      "DUPLICATE_MATCH_PLAYER",
    );
    expectErrorCode(
      start({ ...state, players: [{ ...state.players[0] }, { ...state.players[1], side: "north" }] }),
      "INVALID_PLAYER_SIDES",
    );
  });

  it("rejects missing north, missing south, one unsubmitted player, or both unsubmitted players", () => {
    const state = createReadyState();
    expectErrorCode(
      start({ ...state, players: [{ ...state.players[0], side: "south" }, state.players[1]] }),
      "INVALID_PLAYER_SIDES",
    );
    expectErrorCode(
      start({ ...state, players: [state.players[0], { ...state.players[1], side: "north" }] }),
      "INVALID_PLAYER_SIDES",
    );
    expectErrorCode(
      start({ ...state, players: [{ ...state.players[0], setupSubmitted: false }, state.players[1]] }),
      "INITIAL_PLACEMENT_NOT_COMPLETE",
    );
    expectErrorCode(
      start({
        ...state,
        players: state.players.map((statePlayer) => ({ ...statePlayer, setupSubmitted: false })),
      }),
      "INITIAL_PLACEMENT_NOT_COMPLETE",
    );
  });

  it("validates configured unit counts instead of fixed MVP constants", () => {
    const smallConfig: TacticalRuleConfig = {
      ...baseConfig,
      initialUnitCount: 1,
      reserveUnitCount: 1,
    };
    const validSmallState = createReadyState({ config: smallConfig });

    expectSuccessfulStart(validSmallState, northId, smallConfig);
    expectErrorCode(
      start(
        { ...validSmallState, units: validSmallState.units.slice(1) },
        northId,
        smallConfig,
      ),
      "INVALID_SETUP_UNIT_COUNT",
    );
  });

  it("rejects initial/reserve/total count mismatches", () => {
    const state = createReadyState();
    const northBoard = boardUnit(state, northId, 0);
    const northReserve = reserveUnit(state, northId, 0);
    const extraReserve = unit({ id: "extra-reserve", ownerId: northId, status: "reserve", position: null });
    const extraBoard = unit({ id: "extra-board", ownerId: northId, status: "board", position: { row: 1, col: 7 } });

    expectErrorCode(start({ ...state, units: state.units.filter((stateUnit) => stateUnit.id !== northBoard.id) }), "INVALID_SETUP_UNIT_COUNT");
    expectErrorCode(start({ ...state, units: [...state.units, extraBoard] }), "INVALID_SETUP_UNIT_COUNT");
    expectErrorCode(
      start({ ...state, players: [{ ...state.players[0], reserveUnitIds: [northReserve.id] }, state.players[1]] }),
      "INVALID_SETUP_UNIT_COUNT",
    );
    expectErrorCode(
      start({
        ...state,
        players: [{ ...state.players[0], reserveUnitIds: [northReserve.id, reserveUnit(state, northId, 1).id, extraReserve.id] }, state.players[1]],
        units: [...state.units, extraReserve],
      }),
      "INVALID_SETUP_UNIT_COUNT",
    );
  });

  it("validates reserveUnitIds membership, uniqueness, ownership, status, and position", () => {
    const state = createReadyState();
    const northReserve = reserveUnit(state, northId, 0);
    const northReserveTwo = reserveUnit(state, northId, 1);
    const northBoard = boardUnit(state, northId, 0);
    const southReserve = reserveUnit(state, southId, 0);

    expectErrorCode(
      start({ ...state, players: [{ ...state.players[0], reserveUnitIds: [northReserve.id, northReserve.id] }, state.players[1]] }),
      "INVALID_SETUP_UNIT_COUNT",
    );
    expectErrorCode(
      start({ ...state, players: [{ ...state.players[0], reserveUnitIds: [northReserve.id, toUnitId("missing")] }, state.players[1]] }),
      "INVALID_SETUP_UNIT_STATUS",
    );
    expectErrorCode(
      start({ ...state, players: [{ ...state.players[0], reserveUnitIds: [northReserve.id, southReserve.id] }, state.players[1]] }),
      "INVALID_SETUP_UNIT_STATUS",
    );
    expectErrorCode(
      start({ ...state, players: [{ ...state.players[0], reserveUnitIds: [northReserveTwo.id, northBoard.id] }, state.players[1]] }),
      "INVALID_SETUP_UNIT_STATUS",
    );
    expectErrorCode(
      start(replaceUnit(state, northReserve.id, { position: { row: 0, col: 0 } })),
      "INVALID_SETUP_UNIT_POSITION",
    );
  });

  it("rejects non-reserve owned units that are not valid board units", () => {
    const state = createReadyState();
    const northBoard = boardUnit(state, northId, 0);

    expectErrorCode(replaceAndStart(state, northBoard.id, { position: null }), "INVALID_SETUP_UNIT_POSITION");
    expectErrorCode(replaceAndStart(state, northBoard.id, { status: "reserve", position: null }), "INVALID_SETUP_UNIT_STATUS");
    expectErrorCode(replaceAndStart(state, northBoard.id, { status: "defeated", position: null }), "INVALID_SETUP_UNIT_STATUS");
    expectErrorCode(replaceAndStart(state, northBoard.id, { currentDefense: 0 }), "INVALID_SETUP_UNIT_STATUS");
    expectErrorCode(replaceAndStart(state, northBoard.id, { currentDefense: -1 }), "INVALID_SETUP_UNIT_STATUS");
    expectErrorCode(replaceAndStart(state, northBoard.id, { currentDefense: Number.NaN }), "INVALID_SETUP_UNIT_STATUS");
    expectErrorCode(replaceAndStart(state, northBoard.id, { currentDefense: Number.POSITIVE_INFINITY }), "INVALID_SETUP_UNIT_STATUS");
    expectErrorCode(replaceAndStart(state, northBoard.id, { stance: "invalid" as Stance }), "INVALID_SETUP_UNIT_STATUS");
  });

  it("revalidates initial placement areas and flag exclusion for both sides", () => {
    const state = createReadyState();
    const northBoard = boardUnit(state, northId, 0);
    const southBoard = boardUnit(state, southId, 0);

    expectSuccessfulStart(state);
    expectErrorCode(replaceAndStart(state, northBoard.id, { position: { row: 2, col: 0 } }), "SETUP_UNIT_OUTSIDE_PLACEMENT_AREA");
    expectErrorCode(replaceAndStart(state, southBoard.id, { position: { row: 5, col: 0 } }), "SETUP_UNIT_OUTSIDE_PLACEMENT_AREA");
    expectErrorCode(replaceAndStart(state, northBoard.id, { position: { row: -1, col: 0 } }), "INVALID_SETUP_UNIT_POSITION");
    expectErrorCode(replaceAndStart(state, northBoard.id, { position: { row: 0, col: 3 } }), "SETUP_UNIT_ON_FLAG_AREA");
    expectErrorCode(replaceAndStart(state, southBoard.id, { position: { row: 7, col: 3 } }), "SETUP_UNIT_ON_FLAG_AREA");
  });

  it("detects duplicate board positions between allies, enemies, and opposing sides", () => {
    const state = createReadyState();
    const northFirst = boardUnit(state, northId, 0);
    const northSecond = boardUnit(state, northId, 1);
    const southFirst = boardUnit(state, southId, 0);
    const southSecond = boardUnit(state, southId, 1);

    expectErrorCode(replaceAndStart(state, northSecond.id, { position: northFirst.position }), "DUPLICATE_BOARD_POSITION");
    expectErrorCode(replaceAndStart(state, southSecond.id, { position: southFirst.position }), "DUPLICATE_BOARD_POSITION");
    expectErrorCode(replaceAndStart(state, southFirst.id, { position: northFirst.position }), "DUPLICATE_BOARD_POSITION");
  });

  it("rejects defeated units during setup even when they have no position", () => {
    const state = createReadyState();
    const northBoard = boardUnit(state, northId, 0);

    expectErrorCode(replaceAndStart(state, northBoard.id, { status: "defeated", position: null }), "INVALID_SETUP_UNIT_STATUS");
  });

  it("validates setup visibility while allowing hidden by default", () => {
    const state = createReadyState();
    const northBoard = boardUnit(state, northId, 0);

    expectSuccessfulStart(state);
    expectSuccessfulStart({
      ...state,
      unitVisibilities: [{ unitId: northBoard.id, viewerId: southId, level: "hidden" }],
    });
    expectSuccessfulStart({
      ...state,
      unitVisibilities: [{ unitId: northBoard.id, viewerId: northId, level: "owner_full" }],
    });
    expectErrorCode(
      start({ ...state, unitVisibilities: [{ unitId: northBoard.id, viewerId: southId, level: "revealed" }] }),
      "INVALID_SETUP_VISIBILITY",
    );
    expectErrorCode(
      start({ ...state, unitVisibilities: [{ unitId: northBoard.id, viewerId: southId, level: "owner_full" }] }),
      "INVALID_SETUP_VISIBILITY",
    );
    expectErrorCode(
      start({ ...state, unitVisibilities: [{ unitId: toUnitId("missing"), viewerId: northId, level: "hidden" }] }),
      "INVALID_SETUP_VISIBILITY",
    );
    expectErrorCode(
      start({ ...state, unitVisibilities: [{ unitId: northBoard.id, viewerId: outsiderId, level: "hidden" }] }),
      "INVALID_SETUP_VISIBILITY",
    );
  });

  it("preserves non-transition MatchState references and submitted flags", () => {
    const state = createReadyState();
    const result = expectSuccessfulStart(state, southId);

    expect(result.state.players).toBe(state.players);
    expect(result.state.units).toBe(state.units);
    expect(result.state.unitVisibilities).toBe(state.unitVisibilities);
    expect(result.state.boardSize).toBe(state.boardSize);
    expect(result.state.rulesVersion).toBe(state.rulesVersion);
    expect(result.state.gameMode).toBe(state.gameMode);
    expect(result.state.players.every((statePlayer) => statePlayer.setupSubmitted)).toBe(true);
  });

  it("does not leak secret unit information through MATCH_STARTED, even after JSON serialization", () => {
    const state = createReadyState();
    const result = expectSuccessfulStart(state, northId);
    const event = result.events[0];
    const eventJson = JSON.stringify(event);

    expect(Object.keys(event).sort()).toEqual(["firstPlayerId", "turnNumber", "type"]);
    expect(eventJson).not.toContain("unitId");
    expect(eventJson).not.toContain("row");
    expect(eventJson).not.toContain("col");
    expect(eventJson).not.toContain("stance");
    expect(eventJson).not.toContain("card");
    expect(eventJson).not.toContain("Secret Card");
    expect(eventJson).not.toContain("baseAttack");
    expect(eventJson).not.toContain("baseDefense");
    expect(eventJson).not.toContain("movementType");
    expect(eventJson).not.toContain("artworkUrl");
    expect(eventJson).not.toContain("ability");
    expect(eventJson).not.toContain("secret_rare");
    expect(eventJson).not.toContain("random");
    expect(eventJson).not.toContain("seed");
  });

  it("does not mutate input state, nested arrays, or config", () => {
    const state = createReadyState({
      unitVisibilities: [
        { unitId: toUnitId(`${northId}-board-0`), viewerId: southId, level: "hidden" },
      ],
    });
    const beforeState = json(state);
    const beforePlayers = json(state.players);
    const beforeUnits = json(state.units);
    const beforeVisibility = json(state.unitVisibilities);
    const beforeConfig = json(baseConfig);

    expectSuccessfulStart(state, southId);

    expect(json(state)).toBe(beforeState);
    expect(json(state.players)).toBe(beforePlayers);
    expect(json(state.units)).toBe(beforeUnits);
    expect(json(state.unitVisibilities)).toBe(beforeVisibility);
    expect(json(baseConfig)).toBe(beforeConfig);
  });

  it("does not depend on units or visibility order for transition fields and events", () => {
    const state = createReadyState({
      unitVisibilities: [
        { unitId: toUnitId(`${northId}-board-0`), viewerId: southId, level: "hidden" },
        { unitId: toUnitId(`${southId}-board-0`), viewerId: northId, level: "hidden" },
      ],
    });
    const reversed = {
      ...state,
      units: [...state.units].reverse(),
      unitVisibilities: [...state.unitVisibilities].reverse(),
    };

    const first = expectSuccessfulStart(state, southId);
    const second = expectSuccessfulStart(reversed, southId);

    expect(first.events).toEqual(second.events);
    expect(first.state.phase).toBe(second.state.phase);
    expect(first.state.currentTurnPlayerId).toBe(second.state.currentTurnPlayerId);
    expect(first.state.turnNumber).toBe(second.state.turnNumber);
    expect(first.state.stateVersion).toBe(second.state.stateVersion);
  });
});

const replaceAndStart = (
  state: MatchState,
  targetId: UnitId,
  patch: Partial<UnitState>,
) => start(replaceUnit(state, targetId, patch));
