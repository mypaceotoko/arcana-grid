import { describe, expect, it } from "vitest";

import {
  toMatchId,
  toMatchPlayerId,
  toPlayerId,
  toRulesVersion,
  toUnitId,
} from "../../../src/game";
import type {
  Coordinate,
  GameEventPayload,
  MatchPlayerId,
  PlayerMatchView,
  UnitView,
} from "../../../src/game";
import {
  buildMovePath,
  buildPlaybackSteps,
} from "../../../src/app/debug/local-match/playback";
import {
  buildPlaybackFrames,
  computePlaybackBoard,
} from "../../../src/app/debug/local-match/playback-view";

const SOUTH = toMatchPlayerId("local-debug-south");
const NORTH = toMatchPlayerId("local-debug-north");

const hiddenUnit = (
  id: string,
  ownerId: MatchPlayerId,
  position: Coordinate | null,
): UnitView => ({
  revealed: false,
  unitId: toUnitId(id),
  ownerId,
  position,
  status: position === null ? "reserve" : "board",
  cardBackKey: "debug-back",
});

const view = (units: UnitView[]): PlayerMatchView => ({
  matchId: toMatchId("local-debug-match"),
  gameMode: "tactical_duel",
  rulesVersion: toRulesVersion("tactical_duel.v1"),
  boardSize: { width: 8, height: 8 },
  phase: "active",
  viewerId: SOUTH,
  players: [
    {
      id: NORTH,
      playerId: toPlayerId("acct-north"),
      side: "north",
      reserveUnitIds: [],
      setupSubmitted: true,
      flag: { ownerId: NORTH, damage: 0, maxDamage: 3 },
      connected: true,
    },
    {
      id: SOUTH,
      playerId: toPlayerId("acct-south"),
      side: "south",
      reserveUnitIds: [],
      setupSubmitted: true,
      flag: { ownerId: SOUTH, damage: 0, maxDamage: 3 },
      connected: true,
    },
  ],
  units,
  currentTurnPlayerId: SOUTH,
  turnNumber: 4,
  stateVersion: 12,
  winnerPlayerId: null,
  winReason: null,
});

describe("buildMovePath", () => {
  it("walks a vertical line one cell at a time excluding the origin", () => {
    expect(buildMovePath({ row: 6, col: 5 }, { row: 4, col: 5 })).toEqual([
      { row: 5, col: 5 },
      { row: 4, col: 5 },
    ]);
  });

  it("walks a horizontal line one cell at a time", () => {
    expect(buildMovePath({ row: 2, col: 1 }, { row: 2, col: 4 })).toEqual([
      { row: 2, col: 2 },
      { row: 2, col: 3 },
      { row: 2, col: 4 },
    ]);
  });

  it("walks a diagonal line one cell at a time", () => {
    expect(buildMovePath({ row: 4, col: 4 }, { row: 7, col: 7 })).toEqual([
      { row: 5, col: 5 },
      { row: 6, col: 6 },
      { row: 7, col: 7 },
    ]);
  });

  it("returns just the destination for a single adjacent step", () => {
    expect(buildMovePath({ row: 3, col: 3 }, { row: 3, col: 4 })).toEqual([
      { row: 3, col: 4 },
    ]);
  });
});

describe("buildPlaybackSteps - normal move", () => {
  const preView = view([
    hiddenUnit("local-debug-south-setup-4", SOUTH, { row: 6, col: 5 }),
  ]);
  const postView = view([
    hiddenUnit("local-debug-south-setup-4", SOUTH, { row: 4, col: 5 }),
  ]);
  const events: GameEventPayload[] = [
    {
      type: "UNIT_MOVED",
      unitId: toUnitId("local-debug-south-setup-4"),
      ownerId: SOUTH,
      from: { row: 6, col: 5 },
      to: { row: 4, col: 5 },
      stance: "attack",
    },
    {
      type: "TURN_CHANGED",
      previousPlayerId: SOUTH,
      nextPlayerId: NORTH,
      turnNumber: 5,
    },
  ];

  it("creates a move step with the r5/c5 → r4/c5 path", () => {
    const steps = buildPlaybackSteps({ events, preView, postView });
    expect(steps[0]).toMatchObject({
      kind: "move",
      from: { row: 6, col: 5 },
      to: { row: 4, col: 5 },
      stance: "attack",
      path: [
        { row: 5, col: 5 },
        { row: 4, col: 5 },
      ],
    });
    expect(steps[1]).toMatchObject({ kind: "turn", nextPlayerId: NORTH });
  });

  it("expands the move into one frame per traversed cell", () => {
    const steps = buildPlaybackSteps({ events, preView, postView });
    const frames = buildPlaybackFrames(steps);
    const moveFrames = frames.filter((frame) => frame.tone === "move");
    expect(moveFrames).toHaveLength(2);
    expect(moveFrames[0].moving?.coordinate).toEqual({ row: 5, col: 5 });
    expect(moveFrames[1].moving?.coordinate).toEqual({ row: 4, col: 5 });
  });

  it("moves the unit cell by cell on the reconstructed board", () => {
    const steps = buildPlaybackSteps({ events, preView, postView });
    const frames = buildPlaybackFrames(steps);
    const unitId = toUnitId("local-debug-south-setup-4");
    const at = (index: number): Coordinate | null =>
      computePlaybackBoard(preView, postView, frames, index).units.find(
        (unit) => unit.unitId === unitId,
      )?.position ?? null;
    expect(at(0)).toEqual({ row: 5, col: 5 });
    expect(at(1)).toEqual({ row: 4, col: 5 });
  });
});

describe("buildPlaybackSteps - combat ordering", () => {
  const attackerId = toUnitId("local-debug-south-bolt");
  const defenderId = toUnitId("local-debug-north-oracle");
  const preView = view([
    hiddenUnit("local-debug-south-bolt", SOUTH, { row: 5, col: 5 }),
    hiddenUnit("local-debug-north-oracle", NORTH, { row: 4, col: 4 }),
  ]);
  const postView = view([
    hiddenUnit("local-debug-south-bolt", SOUTH, { row: 4, col: 4 }),
  ]);
  const events: GameEventPayload[] = [
    {
      type: "UNIT_REVEALED",
      unitId: attackerId,
      viewerId: NORTH,
      reason: "first_move",
    },
    {
      type: "UNIT_REVEALED",
      unitId: defenderId,
      viewerId: SOUTH,
      reason: "attacked",
    },
    {
      type: "COMBAT_RESOLVED",
      attackerUnitId: attackerId,
      defenderUnitId: defenderId,
      attackerStance: "attack",
      defenderStance: "defense",
      attackerAttack: 1900,
      defenderAttack: 1600,
      attackerDefenseBefore: 1500,
      attackerDefenseAfter: 1500,
      defenderDefenseBefore: 1700,
      defenderDefenseAfter: 0,
      attackerStatusAfter: "board",
      defenderStatusAfter: "defeated",
      attackerMovedToDestination: true,
      outcome: "defender_defeated",
    },
    {
      type: "DEFENSE_CHANGED",
      unitId: defenderId,
      previousDefense: 1700,
      nextDefense: 0,
    },
    { type: "UNIT_DEFEATED", unitId: defenderId },
    {
      type: "TURN_CHANGED",
      previousPlayerId: SOUTH,
      nextPlayerId: NORTH,
      turnNumber: 5,
    },
  ];

  it("orders reveal, combat, defense change, defeat, advance, then turn", () => {
    const steps = buildPlaybackSteps({ events, preView, postView });
    expect(steps.map((step) => step.kind)).toEqual([
      "reveal",
      "reveal",
      "combat",
      "defense",
      "defeat",
      "advance",
      "turn",
    ]);
  });

  it("advances the surviving attacker to the destination", () => {
    const steps = buildPlaybackSteps({ events, preView, postView });
    const advance = steps.find((step) => step.kind === "advance");
    expect(advance).toMatchObject({
      kind: "advance",
      from: { row: 5, col: 5 },
      to: { row: 4, col: 4 },
      returned: false,
    });
  });

  it("removes the defeated defender from the reconstructed board", () => {
    const steps = buildPlaybackSteps({ events, preView, postView });
    const frames = buildPlaybackFrames(steps);
    const board = computePlaybackBoard(
      preView,
      postView,
      frames,
      frames.length - 1,
    );
    const defender = board.units.find((unit) => unit.unitId === defenderId);
    expect(defender?.position).toBeNull();
    expect(defender?.status).toBe("defeated");
  });

  it("does not advance a defeated attacker", () => {
    const defeatedAttackerEvents: GameEventPayload[] = [
      {
        type: "COMBAT_RESOLVED",
        attackerUnitId: attackerId,
        defenderUnitId: defenderId,
        attackerStance: "attack",
        defenderStance: "attack",
        attackerAttack: 1000,
        defenderAttack: 1000,
        attackerDefenseBefore: 1500,
        attackerDefenseAfter: 0,
        defenderDefenseBefore: 1700,
        defenderDefenseAfter: 0,
        attackerStatusAfter: "defeated",
        defenderStatusAfter: "defeated",
        attackerMovedToDestination: false,
        outcome: "both_defeated",
      },
      { type: "UNIT_DEFEATED", unitId: attackerId },
      { type: "UNIT_DEFEATED", unitId: defenderId },
    ];
    const steps = buildPlaybackSteps({
      events: defeatedAttackerEvents,
      preView,
      postView,
    });
    expect(steps.some((step) => step.kind === "advance")).toBe(false);
  });
});

describe("buildPlaybackSteps - reserve and flag", () => {
  it("produces reserve select then appear steps", () => {
    const unitId = toUnitId("local-debug-south-reserve");
    const preView = view([hiddenUnit("local-debug-south-reserve", SOUTH, null)]);
    const postView = view([
      hiddenUnit("local-debug-south-reserve", SOUTH, { row: 6, col: 0 }),
    ]);
    const events: GameEventPayload[] = [
      {
        type: "RESERVE_DEPLOYED",
        unitId,
        ownerId: SOUTH,
        destination: { row: 6, col: 0 },
        stance: "defense",
      },
      {
        type: "TURN_CHANGED",
        previousPlayerId: SOUTH,
        nextPlayerId: NORTH,
        turnNumber: 5,
      },
    ];
    const steps = buildPlaybackSteps({ events, preView, postView });
    expect(steps.map((step) => step.kind)).toEqual([
      "reserve-select",
      "reserve-appear",
      "turn",
    ]);

    const frames = buildPlaybackFrames(steps);
    const board = computePlaybackBoard(
      preView,
      postView,
      frames,
      frames.length - 1,
    );
    expect(
      board.units.find((unit) => unit.unitId === unitId)?.position,
    ).toEqual({ row: 6, col: 0 });
  });

  it("produces flag attack and damage steps with the central flag area", () => {
    const attackerId = toUnitId("local-debug-south-flag-runner");
    const preView = view([
      hiddenUnit("local-debug-south-flag-runner", SOUTH, { row: 1, col: 3 }),
    ]);
    const postView = preView;
    const events: GameEventPayload[] = [
      {
        type: "FLAG_ATTACKED",
        attackerUnitId: attackerId,
        attackerPlayerId: SOUTH,
        defenderPlayerId: NORTH,
        target: { row: 0, col: 3 },
      },
      {
        type: "FLAG_DAMAGED",
        ownerId: NORTH,
        previousDamage: 2,
        damage: 3,
        appliedDamage: 1,
        maxDamage: 3,
      },
      {
        type: "MATCH_FINISHED",
        winnerPlayerId: SOUTH,
        loserPlayerId: NORTH,
        reason: "flag_destroyed",
      },
    ];
    const steps = buildPlaybackSteps({ events, preView, postView });
    expect(steps.map((step) => step.kind)).toEqual([
      "flag-attack",
      "flag-damage",
      "finish",
    ]);
    const flagStep = steps[0];
    if (flagStep.kind !== "flag-attack") throw new Error("expected flag attack");
    // North flag area is the top-centre two cells.
    expect(flagStep.flagArea).toEqual(
      expect.arrayContaining([
        { row: 0, col: 3 },
        { row: 0, col: 4 },
      ]),
    );
  });

  it("never embeds card names or base stats in playback steps", () => {
    const attackerId = toUnitId("local-debug-south-bolt");
    const defenderId = toUnitId("local-debug-north-oracle");
    const preView = view([
      hiddenUnit("local-debug-south-bolt", SOUTH, { row: 5, col: 5 }),
      hiddenUnit("local-debug-north-oracle", NORTH, { row: 4, col: 4 }),
    ]);
    const events: GameEventPayload[] = [
      {
        type: "COMBAT_RESOLVED",
        attackerUnitId: attackerId,
        defenderUnitId: defenderId,
        attackerStance: "attack",
        defenderStance: "defense",
        attackerAttack: 1900,
        defenderAttack: 1600,
        attackerDefenseBefore: 1500,
        attackerDefenseAfter: 1500,
        defenderDefenseBefore: 1700,
        defenderDefenseAfter: 0,
        attackerStatusAfter: "board",
        defenderStatusAfter: "defeated",
        attackerMovedToDestination: true,
        outcome: "defender_defeated",
      },
    ];
    const steps = buildPlaybackSteps({ events, preView, postView: preView });
    const serialized = JSON.stringify(steps);
    expect(serialized).not.toContain("cardName");
    expect(serialized).not.toContain("North Hidden Shade");
    expect(serialized).not.toContain("baseAttack");
    expect(serialized).not.toContain("movementType");
  });
});
