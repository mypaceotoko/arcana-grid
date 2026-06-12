import { beforeEach, describe, expect, it } from "vitest";

import {
  TACTICAL_DUEL_RULE_CONFIG,
  calculateLegalMoves,
  isCoordinateInFlagArea,
  toActionId,
  toUnitId,
} from "../../../src/game";
import {
  LOCAL_DEBUG_MATCH_PLAYER_IDS,
  localDebugMatchState,
  localDebugSetupMatchState,
} from "../../../src/app/debug/local-match/fixture";
import {
  getLocalDebugFlagAttackCandidates,
  getLocalDebugMatchView,
  getLocalDebugMoveCandidates,
  getLocalDebugReserveDeploymentCandidates,
  resetLocalDebugMatch,
  submitLocalDebugAttackFlag,
  submitLocalDebugConcedeMatch,
  submitLocalDebugDeployReserve,
  submitLocalDebugMoveUnit,
  submitLocalDebugInitialPlacement,
  unsafeGetLocalDebugMatchStateForTests,
  unsafeSetLocalDebugMatchStateForTests,
  unsafeSetFirstPlayerRandomSourceForTests,
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
const southFlagRunner = toUnitId("local-debug-south-flag-runner");
const northReserve = toUnitId("local-debug-north-reserve");

const moveActionId = (name: string) => toActionId(`local-debug-test-${name}`);

beforeEach(() => {
  unwrap(resetLocalDebugMatch("south", "active"));
  unsafeSetFirstPlayerRandomSourceForTests(() => 0);
});


describe("local debug match safe views", () => {
  it("keeps active hidden opponent board positions public without card details", () => {
    const response = unwrap(getLocalDebugMatchView("south"));
    const hidden = response.view.units.find((unit) => unit.unitId === northHiddenShade);

    expect(hidden).toMatchObject({
      revealed: false,
      status: "board",
      position: { row: 1, col: 2 },
    });
    expect(JSON.stringify(hidden)).not.toContain("North Hidden Shade");
    expect(JSON.stringify(hidden)).not.toContain("baseAttack");
  });

  it("keeps setup opponent units out of the safe view", () => {
    unwrap(resetLocalDebugMatch("south", "setup"));
    const response = unwrap(getLocalDebugMatchView("south"));

    expect(response.view.phase).toBe("setup");
    expect(
      response.view.units.some((unit) => unit.ownerId === LOCAL_DEBUG_MATCH_PLAYER_IDS.north),
    ).toBe(false);
  });
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

    const withoutFlagAreas = engineMoves.filter((move) => {
      const northFlag = unwrap(
        isCoordinateInFlagArea({
          coordinate: move.destination,
          side: "north",
          boardSize: state.boardSize,
        }),
      );
      const southFlag = unwrap(
        isCoordinateInFlagArea({
          coordinate: move.destination,
          side: "south",
          boardSize: state.boardSize,
        }),
      );
      return !northFlag && !southFlag;
    });

    expect(response.candidates).toEqual(withoutFlagAreas);
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

    const reset = unwrap(resetLocalDebugMatch("south", "active"));

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


describe("local debug match harness DEPLOY_RESERVE", () => {
  it("returns only safe, legal own reserve deployment candidates", () => {
    const response = unwrap(
      getLocalDebugReserveDeploymentCandidates({ viewerSide: "south", unitId: southReserve }),
    );

    expect(response.candidates.length).toBeGreaterThan(0);
    expect(response.candidates).not.toContainEqual({ destination: { row: 7, col: 3 } });
    expect(response.candidates).not.toContainEqual({ destination: { row: 7, col: 4 } });
    expect(response.candidates).not.toContainEqual({ destination: { row: 6, col: 3 } });
    expect(response.candidates.every((candidate) => candidate.destination.row >= 6)).toBe(true);
    expect(JSON.stringify(response)).not.toContain("South Reserve");
    expect(JSON.stringify(response)).not.toContain("baseAttack");
  });

  it("rejects opponent reserve and reserve deployment outside viewer turn", () => {
    expectErrorCode(
      getLocalDebugReserveDeploymentCandidates({ viewerSide: "south", unitId: northReserve }),
      "UNIT_NOT_OWNED",
    );
    expectErrorCode(
      getLocalDebugReserveDeploymentCandidates({ viewerSide: "north", unitId: northReserve }),
      "NOT_YOUR_TURN",
    );
  });

  it("deploys through applyTacticalDuelAction and returns a safe updated view", () => {
    const response = unwrap(
      submitLocalDebugDeployReserve({
        viewerSide: "south",
        unitId: southReserve,
        destination: { row: 6, col: 0 },
        stance: "attack",
        expectedStateVersion: localDebugMatchState.stateVersion,
        actionId: moveActionId("deploy-reserve"),
      }),
    );
    const deployed = response.view.units.find((unit) => unit.unitId === southReserve);

    expect(deployed).toMatchObject({ status: "board", position: { row: 6, col: 0 } });
    expect(deployed?.revealed).toBe(true);
    if (deployed?.revealed) {
      expect(deployed.stance).toBe("attack");
      expect(deployed.currentDefense).toBe(deployed.card.baseDefense);
    }
    expect(response.view.currentTurnPlayerId).toBe(LOCAL_DEBUG_MATCH_PLAYER_IDS.north);
    expect(response.view.stateVersion).toBe(localDebugMatchState.stateVersion + 1);
    expect(response.events.map((event) => event.type)).toContain("RESERVE_DEPLOYED");
    expect(JSON.stringify(response)).not.toContain("North Reserve Secret");
  });
});

describe("local debug match harness ATTACK_FLAG", () => {
  it("returns safe opponent flag candidates only for own board units on viewer turn", () => {
    const response = unwrap(
      getLocalDebugFlagAttackCandidates({ viewerSide: "south", unitId: southFlagRunner }),
    );

    expect(response.candidates).toEqual([{ destination: { row: 0, col: 3 }, kind: "flag_attack" }]);
    expect(JSON.stringify(response)).not.toContain("South Aegis");
    expect(JSON.stringify(response)).not.toContain("baseAttack");
    expectErrorCode(
      getLocalDebugFlagAttackCandidates({ viewerSide: "south", unitId: northHiddenShade }),
      "UNIT_NOT_OWNED",
    );
    expectErrorCode(
      getLocalDebugFlagAttackCandidates({ viewerSide: "north", unitId: northHiddenShade }),
      "NOT_YOUR_TURN",
    );
  });

  it("applies flag damage, reveal, stance, finish, and does not move the attacker", () => {
    const response = unwrap(
      submitLocalDebugAttackFlag({
        viewerSide: "south",
        unitId: southFlagRunner,
        target: { row: 0, col: 3 },
        nextStance: "defense",
        expectedStateVersion: localDebugMatchState.stateVersion,
        actionId: moveActionId("attack-flag"),
      }),
    );
    const attacker = response.view.units.find((unit) => unit.unitId === southFlagRunner);
    const north = response.view.players.find((player) => player.id === LOCAL_DEBUG_MATCH_PLAYER_IDS.north);

    expect(attacker?.position).toEqual({ row: 2, col: 3 });
    expect(attacker?.revealed).toBe(true);
    if (attacker?.revealed) expect(attacker.stance).toBe("defense");
    expect(north?.flag.damage).toBe(3);
    expect(response.view.phase).toBe("finished");
    expect(response.view.winnerPlayerId).toBe(LOCAL_DEBUG_MATCH_PLAYER_IDS.south);
    expect(response.view.winReason).toBe("flag_destroyed");
    expect(response.view.stateVersion).toBe(localDebugMatchState.stateVersion + 1);
    expect(response.events.map((event) => event.type)).toEqual([
      "UNIT_REVEALED",
      "FLAG_ATTACKED",
      "FLAG_DAMAGED",
      "MATCH_FINISHED",
    ]);
    expect(JSON.stringify(response)).not.toContain("North Hidden Shade");
  });
});

describe("local debug match harness CONCEDE_MATCH", () => {
  it("succeeds during active phase even on the opponent turn", () => {
    const state = unsafeGetLocalDebugMatchStateForTests();
    unsafeSetLocalDebugMatchStateForTests({
      ...state,
      currentTurnPlayerId: LOCAL_DEBUG_MATCH_PLAYER_IDS.north,
    });

    const response = unwrap(
      submitLocalDebugConcedeMatch({
        viewerSide: "south",
        expectedStateVersion: state.stateVersion,
        actionId: moveActionId("concede"),
      }),
    );

    expect(response.view.phase).toBe("finished");
    expect(response.view.winnerPlayerId).toBe(LOCAL_DEBUG_MATCH_PLAYER_IDS.north);
    expect(response.view.winReason).toBe("concession");
    expect(response.view.stateVersion).toBe(state.stateVersion + 1);
    expect(response.events.map((event) => event.type)).toEqual([
      "MATCH_CONCEDED",
      "MATCH_FINISHED",
    ]);
  });

  it("rejects setup and finished phases and blocks later operations", () => {
    const setupState = { ...unsafeGetLocalDebugMatchStateForTests(), phase: "setup" as const };
    unsafeSetLocalDebugMatchStateForTests(setupState);
    expectErrorCode(
      submitLocalDebugConcedeMatch({
        viewerSide: "south",
        expectedStateVersion: setupState.stateVersion,
        actionId: moveActionId("concede-setup"),
      }),
      "INVALID_PHASE",
    );

    unsafeSetLocalDebugMatchStateForTests(localDebugMatchState);
    unwrap(
      submitLocalDebugConcedeMatch({
        viewerSide: "south",
        expectedStateVersion: localDebugMatchState.stateVersion,
        actionId: moveActionId("concede-finished"),
      }),
    );
    expectErrorCode(
      getLocalDebugMoveCandidates({ viewerSide: "south", unitId: southAegis }),
      "MATCH_FINISHED",
    );
  });

  it("rejects stale stateVersion and invalid input without changing state", () => {
    const before = unsafeGetLocalDebugMatchStateForTests();

    expectErrorCode(
      submitLocalDebugConcedeMatch({
        viewerSide: "south",
        expectedStateVersion: before.stateVersion - 1,
        actionId: moveActionId("concede-stale"),
      }),
      "STALE_STATE_VERSION",
    );
    expectErrorCode(
      submitLocalDebugAttackFlag({
        viewerSide: "south",
        unitId: southFlagRunner,
        target: { row: 0, col: 4 },
        nextStance: "attack",
        expectedStateVersion: before.stateVersion,
        actionId: moveActionId("blocked-path"),
      }),
      "FLAG_ATTACK_NOT_LEGAL",
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

describe("local debug match harness initial placement and start", () => {
  const setupUnitId = (side: "north" | "south", index: number) =>
    toUnitId(`local-debug-${side}-setup-${index}`);
  const placements = (side: "north" | "south") => {
    const row = side === "north" ? 0 : 6;
    return [0, 1, 2, 5, 6, 7].map((col, index) => ({
      unitId: setupUnitId(side, index + 1),
      position: { row, col },
      stance: index % 2 === 0 ? "attack" as const : "defense" as const,
    }));
  };
  const reserves = (side: "north" | "south") => [setupUnitId(side, 7), setupUnitId(side, 8)];

  it("resets to the setup fixture with only the viewer's own eight units detailed", () => {
    const response = unwrap(resetLocalDebugMatch("south"));
    const state = unsafeGetLocalDebugMatchStateForTests();

    expect(state).toEqual(localDebugSetupMatchState);
    expect(response.view.phase).toBe("setup");
    expect(response.view.currentTurnPlayerId).toBeNull();
    expect(response.view.turnNumber).toBe(0);
    expect(response.view.players.find((player) => player.id !== response.view.viewerId)?.reserveUnitIds).toEqual([]);
    expect(response.view.units.filter((unit) => unit.ownerId === response.view.viewerId)).toHaveLength(8);
    expect(response.view.units.filter((unit) => unit.ownerId !== response.view.viewerId)).toHaveLength(0);
    expect(response.setup.legalPlacementCoordinates).not.toContainEqual({ row: 7, col: 3 });
  });

  it("rejects invalid setup submissions without mutating state", () => {
    unwrap(resetLocalDebugMatch("south"));
    const before = unsafeGetLocalDebugMatchStateForTests();

    expectErrorCode(
      submitLocalDebugInitialPlacement({
        viewerSide: "south",
        placements: placements("south").slice(0, 5),
        reserveUnitIds: reserves("south"),
        expectedStateVersion: before.stateVersion,
        actionId: moveActionId("setup-count"),
      }),
      "INVALID_INITIAL_PLACEMENT_COUNT",
    );
    expect(unsafeGetLocalDebugMatchStateForTests()).toEqual(before);

    expectErrorCode(
      submitLocalDebugInitialPlacement({
        viewerSide: "south",
        placements: placements("south").map((placement, index) =>
          index === 0 ? { ...placement, unitId: setupUnitId("north", 1) } : placement,
        ),
        reserveUnitIds: reserves("south"),
        expectedStateVersion: before.stateVersion,
        actionId: moveActionId("setup-opponent"),
      }),
      "INITIAL_PLACEMENT_OWNER_MISMATCH",
    );
    expect(unsafeGetLocalDebugMatchStateForTests()).toEqual(before);

    expectErrorCode(
      submitLocalDebugInitialPlacement({
        viewerSide: "south",
        placements: [{ ...placements("south")[0], position: { row: 7, col: 3 } }, ...placements("south").slice(1)],
        reserveUnitIds: reserves("south"),
        expectedStateVersion: before.stateVersion,
        actionId: moveActionId("setup-flag"),
      }),
      "INITIAL_PLACEMENT_DESTINATION_IS_FLAG",
    );
    expect(unsafeGetLocalDebugMatchStateForTests()).toEqual(before);

    expectErrorCode(
      submitLocalDebugInitialPlacement({
        viewerSide: "south",
        placements: placements("south"),
        reserveUnitIds: reserves("south"),
        expectedStateVersion: before.stateVersion - 1,
        actionId: moveActionId("setup-stale"),
      }),
      "STALE_STATE_VERSION",
    );
    expect(unsafeGetLocalDebugMatchStateForTests()).toEqual(before);
  });

  it("keeps phase setup after one submission, hides details from opponent, and rejects resubmit", () => {
    unwrap(resetLocalDebugMatch("south"));
    const response = unwrap(submitLocalDebugInitialPlacement({
      viewerSide: "south",
      placements: placements("south"),
      reserveUnitIds: reserves("south"),
      expectedStateVersion: localDebugSetupMatchState.stateVersion,
      actionId: moveActionId("setup-south"),
    }));

    expect(response.view.phase).toBe("setup");
    expect(response.view.players.find((player) => player.id === response.view.viewerId)?.setupSubmitted).toBe(true);
    expect(response.events.map((event) => event.type)).toContain("INITIAL_PLACEMENT_SUBMITTED");
    expectErrorCode(
      submitLocalDebugInitialPlacement({
        viewerSide: "south",
        placements: placements("south"),
        reserveUnitIds: reserves("south"),
        expectedStateVersion: response.view.stateVersion,
        actionId: moveActionId("setup-resubmit"),
      }),
      "INITIAL_PLACEMENT_ALREADY_SUBMITTED",
    );

    const northView = unwrap(getLocalDebugMatchView("north"));
    const serialized = JSON.stringify(northView);
    expect(serialized).not.toContain("South Setup");
    expect(serialized).not.toContain("debug-card-south-setup");
    expect(northView.view.players.find((player) => player.id === LOCAL_DEBUG_MATCH_PLAYER_IDS.south)?.reserveUnitIds).toEqual([]);
    expect(northView.view.players.find((player) => player.id === LOCAL_DEBUG_MATCH_PLAYER_IDS.south)?.setupSubmitted).toBe(true);
  });

  it("starts via startTacticalDuelMatch after both submissions and allows active MOVE_UNIT", () => {
    unwrap(resetLocalDebugMatch("south"));
    unsafeSetFirstPlayerRandomSourceForTests(() => 1);
    const southResponse = unwrap(submitLocalDebugInitialPlacement({
      viewerSide: "south",
      placements: placements("south"),
      reserveUnitIds: reserves("south"),
      expectedStateVersion: localDebugSetupMatchState.stateVersion,
      actionId: moveActionId("setup-south-start"),
    }));
    const started = unwrap(submitLocalDebugInitialPlacement({
      viewerSide: "north",
      placements: placements("north"),
      reserveUnitIds: reserves("north"),
      expectedStateVersion: southResponse.view.stateVersion,
      actionId: moveActionId("setup-north-start"),
    }));

    expect(started.view.phase).toBe("active");
    expect(started.view.turnNumber).toBe(1);
    expect(started.view.currentTurnPlayerId).toBe(LOCAL_DEBUG_MATCH_PLAYER_IDS.south);
    expect(started.events.map((event) => event.type)).toContain("MATCH_STARTED");

    const moveResult = unwrap(submitLocalDebugMoveUnit({
      viewerSide: "south",
      unitId: setupUnitId("south", 1),
      destination: { row: 5, col: 0 },
      nextStance: "attack",
      expectedStateVersion: started.view.stateVersion,
      actionId: moveActionId("post-start-move"),
    }));
    expect(moveResult.view.phase).toBe("active");
    expect(moveResult.events.map((event) => event.type)).toContain("UNIT_MOVED");
  });
});
