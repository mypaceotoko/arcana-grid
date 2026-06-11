import { describe, expect, it } from "vitest";

import {
  TACTICAL_DUEL_RULE_CONFIG,
  applyMoveUnitAction,
  applySubmitInitialPlacementAction,
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
  CardSnapshot,
  InitialPlacement,
  MatchPlayerState,
  MatchState,
  Result,
  RuleError,
  Stance,
  SubmitInitialPlacementAction,
  TacticalRuleConfig,
  UnitState,
} from "../../../src/game";

const matchId = toMatchId("match-placement");
const north = toMatchPlayerId("north-player");
const south = toMatchPlayerId("south-player");
const config = TACTICAL_DUEL_RULE_CONFIG;

const card = (key: string, baseDefense = 2000): CardSnapshot => ({
  cardId: toCardId(`card-${key}`),
  characterId: toCharacterId(`character-${key}`),
  characterKey: `character-${key}`,
  cardKey: `card-${key}`,
  cardName: `Secret ${key}`,
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
  baseAttack: 1500,
  baseDefense,
  attribute: "neutral",
  rarity: "rare",
  artworkUrl: `https://example.test/${key}.png`,
  abilityData: { secret: key },
});

const player = (
  id: MatchPlayerState["id"],
  side: MatchPlayerState["side"],
  reserveUnitIds: string[],
  setupSubmitted = false,
): MatchPlayerState => ({
  id,
  playerId: toPlayerId(`account-${id}`),
  side,
  reserveUnitIds: reserveUnitIds.map(toUnitId),
  setupSubmitted,
  flag: { ownerId: id, damage: 0, maxDamage: 3 },
  connected: true,
});

const unit = ({
  id,
  ownerId,
  status = "reserve",
  position = null,
  stance = "defense",
  baseDefense = 2000,
  currentDefense = 1,
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

const initialIds = (owner: "north" | "south") =>
  Array.from({ length: 6 }, (_, index) => `${owner}-initial-${index}`);
const reserveIds = (owner: "north" | "south") =>
  Array.from({ length: 2 }, (_, index) => `${owner}-reserve-${index}`);

const baseUnits = (): UnitState[] => [
  ...initialIds("north").map((id) => unit({ id, ownerId: north })),
  ...reserveIds("north").map((id) => unit({ id, ownerId: north })),
  ...initialIds("south").map((id) => unit({ id, ownerId: south })),
  ...reserveIds("south").map((id) => unit({ id, ownerId: south })),
];

const baseState = (overrides: Partial<MatchState> = {}): MatchState => ({
  id: matchId,
  gameMode: "tactical_duel",
  rulesVersion: config.rulesVersion,
  boardSize: { width: 8, height: 8 },
  phase: "setup",
  players: [player(north, "north", reserveIds("north")), player(south, "south", reserveIds("south"))],
  units: baseUnits(),
  unitVisibilities: [],
  currentTurnPlayerId: null,
  turnNumber: 0,
  stateVersion: 3,
  winnerPlayerId: null,
  winReason: null,
  ...overrides,
});

const northPlacements = (ids = initialIds("north")): InitialPlacement[] =>
  ids.map((id, index) => ({
    unitId: toUnitId(id),
    position: index < 3 ? { row: 0, col: index } : { row: 1, col: index - 3 },
    stance: index % 2 === 0 ? "attack" : "defense",
  }));

const southPlacements = (ids = initialIds("south")): InitialPlacement[] =>
  ids.map((id, index) => ({
    unitId: toUnitId(id),
    position: index < 3 ? { row: 6, col: index } : { row: 7, col: index - 3 },
    stance: index % 2 === 0 ? "defense" : "attack",
  }));

const action = (
  overrides: Partial<SubmitInitialPlacementAction> = {},
): SubmitInitialPlacementAction => ({
  type: "SUBMIT_INITIAL_PLACEMENT",
  actionId: toActionId("placement-1"),
  matchId,
  actorId: north,
  placements: northPlacements(),
  reserveUnitIds: reserveIds("north").map(toUnitId),
  expectedStateVersion: 3,
  ...overrides,
});

const unwrap = <T>(result: Result<T, RuleError>): T => {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
};

const expectErrorCode = <T>(result: Result<T, RuleError>, code: RuleError["code"]): void => {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe(code);
  }
};

const getUnit = (state: MatchState, id: string): UnitState => {
  const found = state.units.find((candidate) => candidate.id === toUnitId(id));
  if (found === undefined) {
    throw new Error(`missing ${id}`);
  }
  return found;
};

describe("applyTacticalDuelAction initial placement branch", () => {
  it("dispatches SUBMIT_INITIAL_PLACEMENT and still handles MOVE_UNIT plus unsupported actions", () => {
    const submitted = unwrap(applyTacticalDuelAction({ state: baseState(), action: action(), config }));
    expect(submitted.events.map((event) => event.type)).toEqual(["INITIAL_PLACEMENT_SUBMITTED"]);

    const moveState: MatchState = {
      ...baseState({ phase: "active", currentTurnPlayerId: north, stateVersion: 8, turnNumber: 1 }),
      units: [
        unit({ id: "mover", ownerId: north, status: "board", position: { row: 2, col: 2 }, currentDefense: 2000 }),
        unit({ id: "enemy", ownerId: south, status: "board", position: { row: 7, col: 7 }, currentDefense: 2000 }),
      ],
    };
    expect(
      applyMoveUnitAction({
        state: moveState,
        action: {
          type: "MOVE_UNIT",
          actionId: toActionId("move-1"),
          matchId,
          actorId: north,
          unitId: toUnitId("mover"),
          destination: { row: 2, col: 3 },
          nextStance: "attack",
          expectedStateVersion: 8,
        },
        config,
      }).ok,
    ).toBe(true);

    const unsupported = { type: "UNSUPPORTED_ACTION" as const };
    expectErrorCode(applyTacticalDuelAction({ state: baseState(), action: unsupported, config }), "UNSUPPORTED_ACTION");
  });
});

describe("applySubmitInitialPlacementAction setup validation", () => {
  it("succeeds in setup with null currentTurnPlayerId and rejects invalid match state", () => {
    expect(applySubmitInitialPlacementAction({ state: baseState(), action: action(), config }).ok).toBe(true);
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState({ phase: "active" }), action: action(), config }), "INVALID_PHASE");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState({ phase: "finished", winnerPlayerId: north, winReason: "annihilation" }), action: action(), config }), "MATCH_FINISHED");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState({ winnerPlayerId: north }), action: action(), config }), "MATCH_FINISHED");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState({ currentTurnPlayerId: north }), action: action(), config }), "CURRENT_TURN_PLAYER_MISSING");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState(), action: action({ expectedStateVersion: 2 }), config }), "STALE_STATE_VERSION");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState(), action: action({ matchId: toMatchId("other") }), config }), "MATCH_ID_MISMATCH");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState({ gameMode: "territory_battle" as MatchState["gameMode"] }), action: action(), config }), "UNSUPPORTED_GAME_MODE");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState(), action: action({ actorId: toMatchPlayerId("outsider") }), config }), "NOT_YOUR_TURN");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState({ players: [player(north, "north", reserveIds("north")), player(north, "south", reserveIds("south"))] }), action: action(), config }), "DUPLICATE_MATCH_PLAYER");
  });

  it("marks only the actor as submitted and rejects resubmission without mutation", () => {
    const state = baseState();
    const before = JSON.stringify(state);
    const result = unwrap(applySubmitInitialPlacementAction({ state, action: action(), config }));

    expect(result.state.players[0]).toMatchObject({ id: north, setupSubmitted: true });
    expect(result.state.players[1]).toBe(state.players[1]);
    expect(JSON.stringify(state)).toBe(before);

    const resubmitState = baseState({ players: [player(north, "north", reserveIds("north"), true), player(south, "south", reserveIds("south"))] });
    const resubmitBefore = JSON.stringify(resubmitState);
    const resubmit = applySubmitInitialPlacementAction({ state: resubmitState, action: action(), config });
    expectErrorCode(resubmit, "INITIAL_PLACEMENT_ALREADY_SUBMITTED");
    expect(JSON.stringify(resubmitState)).toBe(resubmitBefore);
  });
});

describe("applySubmitInitialPlacementAction reserve and unit validation", () => {
  it("uses reserveUnitIds to identify the exact six initial units independent of unit order", () => {
    const state = baseState({ units: [...baseUnits()].reverse() });
    const result = unwrap(applySubmitInitialPlacementAction({ state, action: action(), config }));
    expect(result.state.units.map((unitState) => unitState.id)).toEqual(state.units.map((unitState) => unitState.id));
    for (const id of initialIds("north")) {
      expect(getUnit(result.state, id).status).toBe("board");
    }
    for (const id of reserveIds("north")) {
      expect(getUnit(result.state, id)).toBe(getUnit(state, id));
    }
  });

  it("rejects invalid reserveUnitIds", () => {
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState(), action: action({ reserveUnitIds: [toUnitId("north-reserve-0"), toUnitId("north-reserve-0")] }), config }), "INVALID_RESERVE_UNIT_IDS");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState(), action: action({ reserveUnitIds: [toUnitId("north-reserve-0")] }), config }), "INVALID_RESERVE_UNIT_IDS");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState(), action: action({ reserveUnitIds: [toUnitId("north-reserve-0"), toUnitId("north-reserve-1"), toUnitId("north-initial-0")] }), config }), "INVALID_RESERVE_UNIT_IDS");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState(), action: action({ reserveUnitIds: [toUnitId("north-reserve-0"), toUnitId("missing")] }), config }), "INVALID_RESERVE_UNIT_IDS");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState(), action: action({ reserveUnitIds: [toUnitId("north-reserve-0"), toUnitId("south-reserve-0")] }), config }), "INVALID_RESERVE_UNIT_IDS");
  });

  it("rejects invalid placement units", () => {
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState(), action: action({ placements: northPlacements(reserveIds("north").concat(initialIds("north").slice(0, 4))) }), config }), "INITIAL_PLACEMENT_INCLUDES_RESERVE");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState(), action: action({ placements: northPlacements(["south-initial-0", ...initialIds("north").slice(1)]) }), config }), "INITIAL_PLACEMENT_OWNER_MISMATCH");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState(), action: action({ placements: northPlacements(["missing", ...initialIds("north").slice(1)]) }), config }), "INITIAL_PLACEMENT_UNIT_MISMATCH");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState({ units: baseUnits().map((candidate) => candidate.id === toUnitId("north-initial-0") ? { ...candidate, status: "board", position: { row: 2, col: 2 } } : candidate) }), action: action(), config }), "UNIT_NOT_IN_RESERVE");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState({ units: baseUnits().map((candidate) => candidate.id === toUnitId("north-initial-0") ? { ...candidate, status: "defeated" } : candidate) }), action: action(), config }), "UNIT_NOT_IN_RESERVE");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState({ units: baseUnits().map((candidate) => candidate.id === toUnitId("north-initial-0") ? { ...candidate, position: { row: 0, col: 0 } } : candidate) }), action: action(), config }), "UNIT_NOT_IN_RESERVE");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState({ units: baseUnits().map((candidate) => candidate.id === toUnitId("north-initial-0") ? { ...candidate, card: card("bad", Number.NaN) } : candidate) }), action: action(), config }), "INVALID_UNIT_BASE_DEFENSE");
  });
});

describe("applySubmitInitialPlacementAction placement validation", () => {
  it("validates count, unit duplicates, destination duplicates, and custom initialUnitCount", () => {
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState(), action: action({ placements: northPlacements().slice(0, 5) }), config }), "INVALID_INITIAL_PLACEMENT_COUNT");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState(), action: action({ placements: [...northPlacements(), { ...northPlacements()[0], unitId: toUnitId("extra") }] }), config }), "INVALID_INITIAL_PLACEMENT_COUNT");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState(), action: action({ placements: [{ ...northPlacements()[0] }, { ...northPlacements()[0], position: { row: 0, col: 1 } }, ...northPlacements().slice(2)] }), config }), "DUPLICATE_INITIAL_PLACEMENT_UNIT");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState(), action: action({ placements: [{ ...northPlacements()[0] }, { ...northPlacements()[1], position: northPlacements()[0].position }, ...northPlacements().slice(2)] }), config }), "DUPLICATE_INITIAL_PLACEMENT_DESTINATION");

    const customConfig: TacticalRuleConfig = { ...config, initialUnitCount: 5, reserveUnitCount: 3 };
    const customState = baseState({ players: [player(north, "north", ["north-reserve-0", "north-reserve-1", "north-initial-5"]), player(south, "south", reserveIds("south"))] });
    expect(applySubmitInitialPlacementAction({ state: customState, action: action({ placements: northPlacements(initialIds("north").slice(0, 5)), reserveUnitIds: [toUnitId("north-reserve-0"), toUnitId("north-reserve-1"), toUnitId("north-initial-5")] }), config: customConfig }).ok).toBe(true);
  });

  it("validates north/south setup areas, flag areas, board bounds, and occupancy", () => {
    expect(applySubmitInitialPlacementAction({ state: baseState(), action: action({ placements: northPlacements().map((placement, index) => ({ ...placement, position: { row: index < 3 ? 0 : 1, col: index < 3 ? index : index - 3 } })) }), config }).ok).toBe(true);
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState(), action: action({ placements: [{ ...northPlacements()[0], position: { row: 2, col: 0 } }, ...northPlacements().slice(1)] }), config }), "INVALID_INITIAL_PLACEMENT_DESTINATION");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState(), action: action({ placements: [{ ...northPlacements()[0], position: { row: 0, col: 3 } }, ...northPlacements().slice(1)] }), config }), "INITIAL_PLACEMENT_DESTINATION_IS_FLAG");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState(), action: action({ placements: [{ ...northPlacements()[0], position: { row: -1, col: 0 } }, ...northPlacements().slice(1)] }), config }), "INVALID_INITIAL_PLACEMENT_DESTINATION");

    const southAction = action({ actorId: south, placements: southPlacements(), reserveUnitIds: reserveIds("south").map(toUnitId) });
    expect(applySubmitInitialPlacementAction({ state: baseState(), action: southAction, config }).ok).toBe(true);
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState(), action: { ...southAction, placements: [{ ...southPlacements()[0], position: { row: 5, col: 0 } }, ...southPlacements().slice(1)] }, config }), "INVALID_INITIAL_PLACEMENT_DESTINATION");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState(), action: { ...southAction, placements: [{ ...southPlacements()[0], position: { row: 7, col: 3 } }, ...southPlacements().slice(1)] }, config }), "INITIAL_PLACEMENT_DESTINATION_IS_FLAG");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState(), action: { ...southAction, placements: [{ ...southPlacements()[0], position: { row: 8, col: 0 } }, ...southPlacements().slice(1)] }, config }), "INVALID_INITIAL_PLACEMENT_DESTINATION");

    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState({ units: [...baseUnits(), unit({ id: "occupant", ownerId: north, status: "board", position: { row: 0, col: 0 }, currentDefense: 2000 })] }), action: action(), config }), "INITIAL_PLACEMENT_DESTINATION_OCCUPIED");
    expectErrorCode(applySubmitInitialPlacementAction({ state: baseState({ units: [...baseUnits(), unit({ id: "enemy-occupant", ownerId: south, status: "board", position: { row: 0, col: 0 }, currentDefense: 2000 })] }), action: action(), config }), "INITIAL_PLACEMENT_DESTINATION_OCCUPIED");
  });
});

describe("applySubmitInitialPlacementAction state update, visibility, events, and determinism", () => {
  it("updates only the six initial units, preserves reserves, and emits a secret-safe event", () => {
    const state = baseState({ unitVisibilities: [{ unitId: toUnitId("north-initial-0"), viewerId: south, level: "hidden" }] });
    const result = unwrap(applySubmitInitialPlacementAction({ state, action: action(), config }));

    for (const placement of northPlacements()) {
      const nextUnit = getUnit(result.state, String(placement.unitId));
      const previousUnit = getUnit(state, String(placement.unitId));
      expect(nextUnit).toMatchObject({ status: "board", position: placement.position, stance: placement.stance, currentDefense: previousUnit.card.baseDefense });
      expect(nextUnit.id).toBe(previousUnit.id);
      expect(nextUnit.ownerId).toBe(previousUnit.ownerId);
      expect(nextUnit.card).toBe(previousUnit.card);
    }
    for (const id of reserveIds("north")) {
      expect(getUnit(result.state, id)).toBe(getUnit(state, id));
    }

    expect(result.state.phase).toBe("setup");
    expect(result.state.currentTurnPlayerId).toBeNull();
    expect(result.state.turnNumber).toBe(0);
    expect(result.state.winnerPlayerId).toBeNull();
    expect(result.state.winReason).toBeNull();
    expect(result.state.stateVersion).toBe(state.stateVersion + 1);
    expect(result.state.unitVisibilities).toBe(state.unitVisibilities);
    expect(result.events).toEqual([{ type: "INITIAL_PLACEMENT_SUBMITTED", playerId: north, unitCount: 6 }]);
    expect(JSON.stringify(result.events)).not.toMatch(/north-initial|row|col|attack|defense|Secret|baseAttack|baseDefense|movementType|artworkUrl|abilityData|rarity/);
  });

  it("keeps placed units hidden from the opponent and detailed for owner", () => {
    const result = unwrap(applySubmitInitialPlacementAction({ state: baseState(), action: action(), config }));
    const opponentView = unwrap(buildPlayerMatchView({ state: result.state, viewerId: south, cardBackKey: "back" }));
    const ownerView = unwrap(buildPlayerMatchView({ state: result.state, viewerId: north, cardBackKey: "back" }));
    const hidden = opponentView.units.filter((view) => view.ownerId === north && view.status === "board");
    expect(hidden).toHaveLength(6);
    expect(hidden.every((view) => !view.revealed)).toBe(true);
    expect(JSON.stringify(hidden)).not.toMatch(/"stance"|"currentDefense"|"card"|Secret|"baseAttack"|"baseDefense"|"movementType"|"artworkUrl"/);
    expect(ownerView.units.filter((view) => view.ownerId === north && view.status === "board" && view.revealed)).toHaveLength(6);
  });

  it("does not start the match when both players have submitted", () => {
    const first = unwrap(applySubmitInitialPlacementAction({ state: baseState(), action: action(), config }));
    const secondAction = action({ actorId: south, placements: southPlacements(), reserveUnitIds: reserveIds("south").map(toUnitId), expectedStateVersion: first.state.stateVersion });
    const second = unwrap(applySubmitInitialPlacementAction({ state: first.state, action: secondAction, config }));

    expect(second.state.players.every((nextPlayer) => nextPlayer.setupSubmitted)).toBe(true);
    expect(second.state.phase).toBe("setup");
    expect(second.state.currentTurnPlayerId).toBeNull();
    expect(second.events.map((event) => event.type)).toEqual(["INITIAL_PLACEMENT_SUBMITTED"]);
    expect(second.events.map((event) => event.type)).not.toContain("MATCH_STARTED");
  });

  it("is deterministic, preserves array order, and does not mutate inputs", () => {
    const state = baseState();
    const placementAction = action({ placements: [...northPlacements()].reverse() });
    const stateBefore = JSON.stringify(state);
    const actionBefore = JSON.stringify(placementAction);
    const configBefore = JSON.stringify(config);

    const first = unwrap(applySubmitInitialPlacementAction({ state, action: placementAction, config }));
    const second = unwrap(applySubmitInitialPlacementAction({ state, action: placementAction, config }));
    const normalOrder = unwrap(applySubmitInitialPlacementAction({ state, action: action(), config }));

    expect(first).toEqual(second);
    expect(first.state.units).toEqual(normalOrder.state.units);
    expect(first.state.units.map((nextUnit) => nextUnit.id)).toEqual(state.units.map((nextUnit) => nextUnit.id));
    expect(first.state.players.map((nextPlayer) => nextPlayer.id)).toEqual(state.players.map((nextPlayer) => nextPlayer.id));
    expect(first.state.stateVersion).toBe(state.stateVersion + 1);
    expect(JSON.stringify(state)).toBe(stateBefore);
    expect(JSON.stringify(placementAction)).toBe(actionBefore);
    expect(JSON.stringify(config)).toBe(configBefore);
  });
});
