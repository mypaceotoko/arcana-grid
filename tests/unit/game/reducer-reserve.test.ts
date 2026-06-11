import { describe, expect, it } from "vitest";

import {
  TACTICAL_DUEL_RULE_CONFIG,
  applyDeployReserveAction,
  applyTacticalDuelAction,
  buildPlayerMatchView,
  getUnitVisibility,
  isPlayerAnnihilated,
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
  DeployReserveAction,
  GameAction,
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

const matchId = toMatchId("match-reserve");
const playerA = toMatchPlayerId("player-a");
const playerB = toMatchPlayerId("player-b");
const outsider = toMatchPlayerId("outsider");
const config: TacticalRuleConfig = TACTICAL_DUEL_RULE_CONFIG;

const card = (key: string, baseDefense = 2400): CardSnapshot => ({
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
  baseDefense,
  attribute: "neutral",
  rarity: "rare",
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
});

const unit = ({
  id,
  ownerId,
  status = "board",
  position = status === "board" ? { row: 4, col: 0 } : null,
  stance = "defense",
  baseDefense = 2400,
  currentDefense = status === "reserve" ? 1 : baseDefense,
}: {
  id: string;
  ownerId: UnitState["ownerId"];
  status?: UnitState["status"];
  position?: UnitState["position"];
  stance?: Stance;
  baseDefense?: number;
  currentDefense?: number;
}): UnitState => ({
  id: toUnitId(id),
  ownerId,
  card: card(id, baseDefense),
  status,
  position,
  stance,
  currentDefense,
});

const boardUnits = (
  ownerId: UnitState["ownerId"],
  count: number,
  row: number,
): UnitState[] =>
  Array.from({ length: count }, (_, index) =>
    unit({
      id: `${ownerId}-board-${index}`,
      ownerId,
      status: "board",
      position: { row, col: index },
    }),
  );

const reserve = (overrides: Partial<Parameters<typeof unit>[0]> = {}): UnitState =>
  unit({
    id: "reserve-a",
    ownerId: playerA,
    status: "reserve",
    position: null,
    stance: "defense",
    baseDefense: 2600,
    currentDefense: 1,
    ...overrides,
  });

const baseState = (overrides: Partial<MatchState> = {}): MatchState => ({
  id: matchId,
  gameMode: "tactical_duel",
  rulesVersion: config.rulesVersion,
  boardSize: { width: 8, height: 8 },
  phase: "active",
  players: [player(playerA, "south"), player(playerB, "north")],
  units: [
    unit({ id: "ally-board", ownerId: playerA, position: { row: 6, col: 0 } }),
    reserve(),
    unit({ id: "enemy-board", ownerId: playerB, position: { row: 1, col: 0 } }),
  ],
  unitVisibilities: [],
  currentTurnPlayerId: playerA,
  turnNumber: 4,
  stateVersion: 9,
  winnerPlayerId: null,
  winReason: null,
  ...overrides,
});

const action = (
  overrides: Partial<DeployReserveAction> = {},
): DeployReserveAction => ({
  type: "DEPLOY_RESERVE",
  actionId: toActionId("deploy-1"),
  matchId,
  actorId: playerA,
  unitId: toUnitId("reserve-a"),
  destination: { row: 6, col: 1 },
  stance: "attack",
  expectedStateVersion: 9,
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

const runDeploy = (
  state: MatchState,
  deployAction: DeployReserveAction,
): TacticalDuelActionResult =>
  unwrap(applyDeployReserveAction({ state, action: deployAction, config }));

const getUnit = (state: MatchState, id: string): UnitState => {
  const found = state.units.find((candidate) => candidate.id === toUnitId(id));

  if (found === undefined) {
    throw new Error(`Unit ${id} not found.`);
  }

  return found;
};

const eventTypes = (events: readonly GameEventPayload[]): readonly string[] =>
  events.map((event) => event.type);

const cloneJson = (value: unknown): string => JSON.stringify(value);

const expectUnchangedOnError = (
  state: MatchState,
  deployAction: DeployReserveAction,
  expectedCode: RuleError["code"],
): void => {
  const before = cloneJson(state);
  const actionBefore = cloneJson(deployAction);
  const result = applyDeployReserveAction({ state, action: deployAction, config });

  expectErrorCode(result, expectedCode);
  expect(cloneJson(state)).toBe(before);
  expect(cloneJson(deployAction)).toBe(actionBefore);
};

describe("applyTacticalDuelAction reserve branch", () => {
  it("dispatches DEPLOY_RESERVE and still rejects unsupported actions", () => {
    const deployed = unwrap(
      applyTacticalDuelAction({ state: baseState(), action: action(), config }),
    );
    expect(eventTypes(deployed.events)).toEqual(["RESERVE_DEPLOYED", "TURN_CHANGED"]);

    const unsupported: GameAction = {
      type: "SUBMIT_INITIAL_PLACEMENT",
      actionId: toActionId("setup-1"),
      matchId,
      actorId: playerA,
      placements: [],
      expectedStateVersion: 9,
    };
    expectErrorCode(
      applyTacticalDuelAction({ state: baseState(), action: unsupported, config }),
      "UNSUPPORTED_ACTION",
    );
  });
});

describe("applyDeployReserveAction pre-validation", () => {
  const reserveWithPosition = reserve({ position: { row: 6, col: 2 } });
  const sixBoardUnits = boardUnits(playerA, 6, 4);
  const validationCases: readonly [string, MatchState, DeployReserveAction, RuleError["code"]][] = [
    ["matchId mismatch", baseState(), action({ matchId: toMatchId("other") }), "MATCH_ID_MISMATCH"],
    ["unsupported game mode", baseState({ gameMode: "territory_battle" as MatchState["gameMode"] }), action(), "UNSUPPORTED_GAME_MODE"],
    ["non-active phase", baseState({ phase: "setup" }), action(), "INVALID_PHASE"],
    ["winner already set", baseState({ winnerPlayerId: playerA }), action(), "MATCH_FINISHED"],
    ["missing current turn", baseState({ currentTurnPlayerId: null }), action(), "CURRENT_TURN_PLAYER_MISSING"],
    ["opponent turn", baseState({ currentTurnPlayerId: playerB }), action(), "NOT_YOUR_TURN"],
    ["stale state", baseState(), action({ expectedStateVersion: 8 }), "STALE_STATE_VERSION"],
    ["actor outside players", baseState({ currentTurnPlayerId: outsider }), action({ actorId: outsider }), "NOT_YOUR_TURN"],
    ["invalid player count", baseState({ players: [player(playerA, "south")] }), action(), "INVALID_PLAYER_COUNT"],
    ["duplicate players", baseState({ players: [player(playerA, "south"), player(playerA, "north")] }), action(), "DUPLICATE_MATCH_PLAYER"],
    ["unit missing", baseState(), action({ unitId: toUnitId("missing") }), "UNIT_NOT_FOUND"],
    ["target unit duplicated", baseState({ units: [...baseState().units, reserve()] }), action(), "DUPLICATE_UNIT"],
    ["non-target unit duplicated", baseState({ units: [...baseState().units, getUnit(baseState(), "enemy-board")] }), action(), "DUPLICATE_UNIT"],
    ["other player's reserve", baseState({ units: [reserve({ ownerId: playerB }), unit({ id: "enemy-board", ownerId: playerB, position: { row: 1, col: 0 } }), unit({ id: "ally-board", ownerId: playerA, position: { row: 6, col: 0 } })] }), action(), "UNIT_NOT_OWNED"],
    ["board unit", baseState(), action({ unitId: toUnitId("ally-board") }), "UNIT_NOT_IN_RESERVE"],
    ["defeated unit", baseState({ units: [unit({ id: "reserve-a", ownerId: playerA, status: "defeated", position: null, currentDefense: 0 }), unit({ id: "enemy-board", ownerId: playerB, position: { row: 1, col: 0 } })] }), action(), "UNIT_DEFEATED"],
    ["reserve with position", baseState({ units: [unit({ id: "ally-board", ownerId: playerA, position: { row: 6, col: 0 } }), reserveWithPosition, unit({ id: "enemy-board", ownerId: playerB, position: { row: 1, col: 0 } })] }), action(), "UNIT_NOT_IN_RESERVE"],
    ["deployment limit reached", baseState({ units: [...sixBoardUnits, reserve(), unit({ id: "enemy-board", ownerId: playerB, position: { row: 1, col: 0 } })] }), action({ destination: { row: 6, col: 6 } }), "RESERVE_DEPLOYMENT_LIMIT_REACHED"],
    ["out of bounds", baseState(), action({ destination: { row: 8, col: 0 } }), "OUT_OF_BOUNDS"],
    ["outside initial area", baseState(), action({ destination: { row: 3, col: 0 } }), "INVALID_RESERVE_DESTINATION"],
    ["occupied destination", baseState(), action({ destination: { row: 6, col: 0 } }), "RESERVE_DESTINATION_OCCUPIED"],
    ["flag area", baseState(), action({ destination: { row: 7, col: 3 } }), "RESERVE_DESTINATION_IS_FLAG"],
    ["invalid stance", baseState(), action({ stance: "face-up" as Stance }), "INVALID_ACTION"],
    ["invalid base defense", baseState({ units: [unit({ id: "ally-board", ownerId: playerA, position: { row: 6, col: 0 } }), reserve({ baseDefense: 0 }), unit({ id: "enemy-board", ownerId: playerB, position: { row: 1, col: 0 } })] }), action(), "INVALID_UNIT_BASE_DEFENSE"],
  ];

  it.each(validationCases)("rejects %s without mutation or events", (_name, state, deployAction, code) => {
    expectUnchangedOnError(state, deployAction, code);
  });

  it("uses MatchPlayerState.side for deployment area validation", () => {
    const state = baseState({
      players: [player(playerA, "north"), player(playerB, "south")],
      units: [
        unit({ id: "ally-board", ownerId: playerA, position: { row: 1, col: 0 } }),
        reserve(),
        unit({ id: "enemy-board", ownerId: playerB, position: { row: 6, col: 0 } }),
      ],
    });

    expectErrorCode(
      applyDeployReserveAction({ state, action: action({ destination: { row: 6, col: 1 } }), config }),
      "INVALID_RESERVE_DESTINATION",
    );
    expect(runDeploy(state, action({ destination: { row: 1, col: 1 } })).events[0]).toMatchObject({
      type: "RESERVE_DEPLOYED",
      destination: { row: 1, col: 1 },
    });
  });
});

describe("applyDeployReserveAction success", () => {
  it("deploys a reserve through deployReserveUnit, preserves order, advances turn, and emits deterministic public events", () => {
    const state = baseState({
      units: [
        unit({ id: "enemy-board", ownerId: playerB, position: { row: 1, col: 0 } }),
        reserve(),
        unit({ id: "ally-board", ownerId: playerA, position: { row: 6, col: 0 } }),
      ],
    });
    const before = cloneJson(state);
    const result = runDeploy(state, action({ destination: { row: 6, col: 1 }, stance: "attack" }));
    const deployed = getUnit(result.state, "reserve-a");
    const original = getUnit(state, "reserve-a");

    expect(deployed).not.toBe(original);
    expect(deployed.status).toBe("board");
    expect(deployed.position).toEqual({ row: 6, col: 1 });
    expect(deployed.stance).toBe("attack");
    expect(deployed.currentDefense).toBe(original.card.baseDefense);
    expect(deployed.id).toBe(original.id);
    expect(deployed.ownerId).toBe(original.ownerId);
    expect(deployed.card).toBe(original.card);
    expect(getUnit(result.state, "ally-board")).toBe(getUnit(state, "ally-board"));
    expect(result.state.units.map((stateUnit) => stateUnit.id)).toEqual(state.units.map((stateUnit) => stateUnit.id));
    expect(result.state.stateVersion).toBe(10);
    expect(result.state.turnNumber).toBe(5);
    expect(result.state.currentTurnPlayerId).toBe(playerB);
    expect(eventTypes(result.events)).toEqual(["RESERVE_DEPLOYED", "TURN_CHANGED"]);
    expect(result.events[0]).toEqual({
      type: "RESERVE_DEPLOYED",
      unitId: toUnitId("reserve-a"),
      ownerId: playerA,
      destination: { row: 6, col: 1 },
      stance: "attack",
    });
    expect(result.events.at(-1)).toEqual({
      type: "TURN_CHANGED",
      previousPlayerId: playerA,
      nextPlayerId: playerB,
      turnNumber: 5,
    });
    expect(Object.keys(result.events[0])).not.toEqual(
      expect.arrayContaining(["card", "cardName", "movementType", "baseAttack", "baseDefense", "currentDefense", "artworkUrl"]),
    );
    expect(cloneJson(state)).toBe(before);
  });

  it("supports attack and defense stance deployments in state and event payloads", () => {
    const attackResult = runDeploy(baseState(), action({ stance: "attack" }));
    const defenseResult = runDeploy(baseState(), action({ stance: "defense" }));

    expect(getUnit(attackResult.state, "reserve-a").stance).toBe("attack");
    expect(attackResult.events[0]).toMatchObject({ type: "RESERVE_DEPLOYED", stance: "attack" });
    expect(getUnit(defenseResult.state, "reserve-a").stance).toBe("defense");
    expect(defenseResult.events[0]).toMatchObject({ type: "RESERVE_DEPLOYED", stance: "defense" });
  });
});

describe("applyDeployReserveAction visibility and secrecy", () => {
  it("keeps unitVisibilities unchanged and relies on hidden-by-default opponent views", () => {
    const visibilities: UnitVisibility[] = [
      { unitId: toUnitId("reserve-a"), viewerId: playerB, level: "hidden" },
    ];
    const result = runDeploy(baseState({ unitVisibilities: visibilities }), action());
    const deployed = getUnit(result.state, "reserve-a");

    expect(result.state.unitVisibilities).toBe(visibilities);
    expect(getUnitVisibility({ unit: deployed, viewerId: playerB, visibilities: result.state.unitVisibilities })).toBe("hidden");
    expect(eventTypes(result.events)).not.toContain("UNIT_REVEALED");
    expect(result.state.unitVisibilities).toHaveLength(1);

    const opponentView = unwrap(
      buildPlayerMatchView({ state: result.state, viewerId: playerB, cardBackKey: "back" }),
    );
    const ownerView = unwrap(
      buildPlayerMatchView({ state: result.state, viewerId: playerA, cardBackKey: "back" }),
    );
    const opponentReserve = opponentView.units.find((view) => view.unitId === toUnitId("reserve-a"));
    const ownerReserve = ownerView.units.find((view) => view.unitId === toUnitId("reserve-a"));

    expect(opponentReserve).toMatchObject({ revealed: false, cardBackKey: "back" });
    const serializedOpponentView = JSON.stringify(opponentReserve);
    expect(serializedOpponentView).not.toContain("Secret Card");
    expect(serializedOpponentView).not.toContain("baseAttack");
    expect(serializedOpponentView).not.toContain("baseDefense");
    expect(serializedOpponentView).not.toContain("movementType");
    expect(serializedOpponentView).not.toContain("artworkUrl");
    expect(ownerReserve).toMatchObject({ revealed: true });
    expect(JSON.stringify(ownerReserve)).toContain("Secret Card reserve-a");
  });
});

describe("applyDeployReserveAction victory, state version, and determinism", () => {
  it("does not finish a normal deployment and remains consistent with annihilation checks", () => {
    const result = runDeploy(baseState(), action());

    expect(result.state.phase).toBe("active");
    expect(result.state.winnerPlayerId).toBeNull();
    expect(result.state.winReason).toBeNull();
    expect(eventTypes(result.events)).not.toContain("MATCH_FINISHED");
    expect(unwrap(isPlayerAnnihilated({ playerId: playerA, units: result.state.units }))).toBe(false);
    expect(unwrap(isPlayerAnnihilated({ playerId: playerB, units: result.state.units }))).toBe(false);
  });

  it("fails the whole reducer when post-deployment victory state is ambiguous", () => {
    const state = baseState({
      players: [
        { ...player(playerA, "south"), flag: { ownerId: playerA, damage: 3, maxDamage: 3 } },
        { ...player(playerB, "north"), flag: { ownerId: playerB, damage: 3, maxDamage: 3 } },
      ],
    });
    const before = cloneJson(state);
    const result = applyDeployReserveAction({ state, action: action(), config });

    expectErrorCode(result, "AMBIGUOUS_VICTORY_STATE");
    expect(cloneJson(state)).toBe(before);
  });

  it("returns equal outputs for equal inputs and increments stateVersion only once", () => {
    const state = baseState();
    const deployAction = action({ destination: { row: 6, col: 1 } });
    const first = runDeploy(state, deployAction);
    const second = runDeploy(state, deployAction);

    expect(first).toEqual(second);
    expect(first.state.stateVersion).toBe(state.stateVersion + 1);
    expect(eventTypes(first.events)).toEqual(["RESERVE_DEPLOYED", "TURN_CHANGED"]);
  });

  it("updates the target unit by id regardless of array order", () => {
    const units = [
      unit({ id: "enemy-board", ownerId: playerB, position: { row: 1, col: 0 } }),
      unit({ id: "ally-board", ownerId: playerA, position: { row: 6, col: 0 } }),
      reserve(),
    ];
    const result = runDeploy(baseState({ units }), action());

    expect(result.state.units.map((stateUnit) => stateUnit.id)).toEqual(units.map((stateUnit) => stateUnit.id));
    expect(getUnit(result.state, "reserve-a").status).toBe("board");
    expect(getUnit(result.state, "ally-board").position).toEqual({ row: 6, col: 0 });
  });

  it("does not mutate state, units, visibilities, action, or config", () => {
    const state = baseState({ unitVisibilities: [{ unitId: toUnitId("other"), viewerId: playerA, level: "hidden" }] });
    const deployAction = action();
    const snapshots = {
      state: cloneJson(state),
      unit: cloneJson(getUnit(state, "reserve-a")),
      visibilities: cloneJson(state.unitVisibilities),
      action: cloneJson(deployAction),
      config: cloneJson(config),
    };

    runDeploy(state, deployAction);

    expect(cloneJson(state)).toBe(snapshots.state);
    expect(cloneJson(getUnit(state, "reserve-a"))).toBe(snapshots.unit);
    expect(cloneJson(state.unitVisibilities)).toBe(snapshots.visibilities);
    expect(cloneJson(deployAction)).toBe(snapshots.action);
    expect(cloneJson(config)).toBe(snapshots.config);
  });
});
