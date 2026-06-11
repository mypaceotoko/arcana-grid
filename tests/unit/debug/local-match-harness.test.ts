import { beforeEach, describe, expect, it } from "vitest";

import {
  TACTICAL_DUEL_RULE_CONFIG,
  calculateLegalMoves,
  toActionId,
  toUnitId,
} from "../../../src/game";
import {
  LOCAL_DEBUG_MATCH_PLAYER_IDS,
  localDebugMatchState,
} from "../../../src/app/debug/local-match/fixture";
import {
  getLocalDebugMatchView,
  getLocalDebugMoveCandidates,
  resetLocalDebugMatch,
  submitLocalDebugMoveUnit,
  unsafeGetLocalDebugMatchStateForTests,
} from "../../../src/app/debug/local-match/harness";
import type { Result, RuleError } from "../../../src/game";

const unwrap = <T>(result: Result<T, RuleError>): T => {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

const expectErrorCode = <T>(
  result: Result<T, RuleError>,
  code: RuleError["code"],
): RuleError => {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Expected error result.");
  expect(result.error.code).toBe(code);
  return result.error;
};

const southBolt = toUnitId("local-debug-south-bolt");
const southAegis = toUnitId("local-debug-south-aegis");
const southReserve = toUnitId("local-debug-south-reserve");
const southDefeated = toUnitId("local-debug-south-defeated");
const northHiddenShade = toUnitId("local-debug-north-hidden-shade");

const moveActionId = (name: string) => toActionId(`local-debug-test-${name}`);

beforeEach(() => {
  unwrap(resetLocalDebugMatch("south"));
});

describe("local debug match harness move candidates", () => {
  it("allows candidates only for the current viewer's board units", () => {
    const ownBoard = unwrap(
      getLocalDebugMoveCandidates({ viewerSide: "south", unitId: southBolt }),
    );

    expect(ownBoard.candidates.length).toBeGreaterThan(0);
    expectErrorCode(
      getLocalDebugMoveCandidates({ viewerSide: "south", unitId: northHiddenShade }),
      "UNIT_NOT_OWNED",
    );
    expectErrorCode(
      getLocalDebugMoveCandidates({ viewerSide: "south", unitId: southReserve }),
      "UNIT_NOT_ON_BOARD",
    );
    expectErrorCode(
      getLocalDebugMoveCandidates({ viewerSide: "south", unitId: southDefeated }),
      "UNIT_DEFEATED",
    );
  });

  it("rejects candidate requests outside the viewer turn", () => {
    expectErrorCode(
      getLocalDebugMoveCandidates({ viewerSide: "north", unitId: northHiddenShade }),
      "NOT_YOUR_TURN",
    );
  });

  it("returns move and engage candidates derived from calculateLegalMoves only", () => {
    const response = unwrap(
      getLocalDebugMoveCandidates({ viewerSide: "south", unitId: southBolt }),
    );
    const state = unsafeGetLocalDebugMatchStateForTests();
    const unit = state.units.find((candidate) => candidate.id === southBolt);

    if (unit === undefined) throw new Error("missing fixture unit");

    const engineMoves = unwrap(
      calculateLegalMoves({
        unit,
        units: state.units,
        boardSize: state.boardSize,
        movementRule: unit.card.movementRule,
        config: TACTICAL_DUEL_RULE_CONFIG,
      }),
    );

    expect(response.candidates).toEqual(engineMoves);
    expect(response.candidates).toContainEqual({
      destination: { row: 4, col: 5 },
      kind: "move",
    });
    expect(response.candidates).toContainEqual({
      destination: { row: 3, col: 4 },
      kind: "engage",
    });
    expect(JSON.stringify(response)).not.toContain("North Revealed Oracle");
    expect(JSON.stringify(response)).not.toContain("North Hidden Shade");
    expect(JSON.stringify(response)).not.toContain("baseAttack");
  });
});

describe("local debug match harness MOVE_UNIT", () => {
  it("rejects stale stateVersion and keeps the authoritative state unchanged", () => {
    const before = unsafeGetLocalDebugMatchStateForTests();

    expectErrorCode(
      submitLocalDebugMoveUnit({
        viewerSide: "south",
        unitId: southAegis,
        destination: { row: 5, col: 3 },
        nextStance: "attack",
        expectedStateVersion: before.stateVersion - 1,
        actionId: moveActionId("stale"),
      }),
      "STALE_STATE_VERSION",
    );

    expect(unsafeGetLocalDebugMatchStateForTests()).toEqual(before);
  });

  it("applies a normal move through applyTacticalDuelAction and returns the updated safe viewer view", () => {
    const response = unwrap(
      submitLocalDebugMoveUnit({
        viewerSide: "south",
        unitId: southAegis,
        destination: { row: 5, col: 3 },
        nextStance: "attack",
        expectedStateVersion: localDebugMatchState.stateVersion,
        actionId: moveActionId("normal"),
      }),
    );
    const moved = response.view.units.find((unit) => unit.unitId === southAegis);

    expect(moved).toMatchObject({
      position: { row: 5, col: 3 },
      status: "board",
    });
    expect(moved?.revealed).toBe(true);
    if (moved?.revealed) expect(moved.stance).toBe("attack");
    expect(response.view.currentTurnPlayerId).toBe(LOCAL_DEBUG_MATCH_PLAYER_IDS.north);
    expect(response.view.stateVersion).toBe(localDebugMatchState.stateVersion + 1);
    expect(response.events.map((event) => event.type)).toContain("UNIT_REVEALED");
    expect(response.events.map((event) => event.type)).toContain("UNIT_MOVED");
    expect(response.events.map((event) => event.type)).toContain("TURN_CHANGED");
  });

  it("reflects reducer combat, reveal, defense, defeat-related events, turn change, and safe hidden data", () => {
    const response = unwrap(
      submitLocalDebugMoveUnit({
        viewerSide: "south",
        unitId: southBolt,
        destination: { row: 3, col: 4 },
        nextStance: "defense",
        expectedStateVersion: localDebugMatchState.stateVersion,
        actionId: moveActionId("combat"),
      }),
    );
    const eventTypes = response.events.map((event) => event.type);

    expect(eventTypes).toContain("COMBAT_RESOLVED");
    expect(eventTypes).toContain("TURN_CHANGED");
    expect(
      eventTypes.includes("DEFENSE_CHANGED") || eventTypes.includes("UNIT_DEFEATED"),
    ).toBe(true);
    expect(response.view.currentTurnPlayerId).toBe(LOCAL_DEBUG_MATCH_PLAYER_IDS.north);
    expect(response.view.stateVersion).toBe(localDebugMatchState.stateVersion + 1);

    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain("North Hidden Shade");
    expect(serialized).not.toContain("debug-card-north-shade-secret");
    expect(serialized).not.toContain("north-reserve-secret");
  });

  it("resets back to the fixture initial state", () => {
    unwrap(
      submitLocalDebugMoveUnit({
        viewerSide: "south",
        unitId: southAegis,
        destination: { row: 5, col: 3 },
        nextStance: "attack",
        expectedStateVersion: localDebugMatchState.stateVersion,
        actionId: moveActionId("before-reset"),
      }),
    );

    const reset = unwrap(resetLocalDebugMatch("south"));

    expect(reset.view.stateVersion).toBe(localDebugMatchState.stateVersion);
    expect(reset.events).toEqual([]);
    expect(unsafeGetLocalDebugMatchStateForTests()).toEqual(localDebugMatchState);
  });

  it("does not mutate state for invalid MOVE_UNIT input", () => {
    const before = unsafeGetLocalDebugMatchStateForTests();

    expectErrorCode(
      submitLocalDebugMoveUnit({
        viewerSide: "south",
        unitId: southAegis,
        destination: { row: 2, col: 4 },
        nextStance: "attack",
        expectedStateVersion: localDebugMatchState.stateVersion,
        actionId: moveActionId("invalid-destination"),
      }),
      "DESTINATION_NOT_LEGAL",
    );

    expect(unsafeGetLocalDebugMatchStateForTests()).toEqual(before);
  });
});

describe("local debug match safe state responses", () => {
  it("does not leak unrevealed opponent card details in the JSON view", () => {
    const response = unwrap(getLocalDebugMatchView("south"));
    const serialized = JSON.stringify(response);

    expect(serialized).toContain("arcana-grid-debug-card-back");
    expect(serialized).not.toContain("North Hidden Shade");
    expect(serialized).not.toContain("debug-card-north-shade-secret");
    expect(serialized).not.toContain("North Reserve Secret");
  });
});
