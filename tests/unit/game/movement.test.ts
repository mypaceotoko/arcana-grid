import { describe, expect, it } from "vitest";

import {
  TACTICAL_DUEL_RULE_CONFIG,
  calculateLegalMoves,
  toCardId,
  toCharacterId,
  toMatchPlayerId,
  toUnitId,
} from "../../../src/game";
import type {
  BoardSize,
  CardSnapshot,
  Coordinate,
  LegalMove,
  MovementRule,
  MovementType,
  UnitState,
} from "../../../src/game";

const boardSize: BoardSize = { width: 8, height: 8 };
const playerA = toMatchPlayerId("player-a");
const playerB = toMatchPlayerId("player-b");

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
  kind: "line",
  directions: [
    { row: -1, col: -1 },
    { row: -1, col: 0 },
    { row: -1, col: 1 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
    { row: 1, col: -1 },
    { row: 1, col: 0 },
    { row: 1, col: 1 },
  ],
  maxDistance: 1,
};

const specialOffsetRule = (offsets: readonly Coordinate[]): MovementRule => ({
  kind: "offset",
  offsets: [...offsets],
  canJump: true,
});

const card = (
  movementType: MovementType,
  movementRule: MovementRule,
): CardSnapshot => ({
  cardId: toCardId(`card-${movementType}`),
  characterId: toCharacterId(`character-${movementType}`),
  characterKey: `character-${movementType}`,
  cardKey: `card-${movementType}`,
  cardName: `Test ${movementType}`,
  movementType,
  movementRule,
  baseAttack: 1,
  baseDefense: 1,
  attribute: "neutral",
  artworkUrl: null,
  abilityData: {},
});

const unit = ({
  id,
  ownerId = playerA,
  position = { row: 3, col: 3 },
  status = "board",
  movementType = "orthogonal",
  movementRule = orthogonalRule,
}: {
  id: string;
  ownerId?: UnitState["ownerId"];
  position?: UnitState["position"];
  status?: UnitState["status"];
  movementType?: MovementType;
  movementRule?: MovementRule;
}): UnitState => ({
  id: toUnitId(id),
  ownerId,
  card: card(movementType, movementRule),
  status,
  position,
  stance: "attack",
  currentDefense: 1,
});

const movesFor = (
  movingUnit: UnitState,
  units: readonly UnitState[],
  movementRule: MovementRule = movingUnit.card.movementRule,
): readonly LegalMove[] => {
  const result = calculateLegalMoves({
    unit: movingUnit,
    units,
    boardSize,
    movementRule,
    config: TACTICAL_DUEL_RULE_CONFIG,
  });

  expect(result.ok).toBe(true);
  return result.ok ? result.value : [];
};

const destinations = (moves: readonly LegalMove[]): readonly Coordinate[] =>
  moves.map((move) => move.destination);

const expectSorted = (moves: readonly LegalMove[]): void => {
  expect(moves).toEqual(
    [...moves].sort((left, right) => {
      const rowDiff = left.destination.row - right.destination.row;
      return rowDiff === 0
        ? left.destination.col - right.destination.col
        : rowDiff;
    }),
  );
};

describe("orthogonal movement", () => {
  it("moves from the center across all orthogonal lines", () => {
    const actor = unit({ id: "actor" });
    const moves = movesFor(actor, [actor]);

    expect(moves).toHaveLength(14);
    expect(destinations(moves)).toContainEqual({ row: 0, col: 3 });
    expect(destinations(moves)).toContainEqual({ row: 7, col: 3 });
    expect(destinations(moves)).toContainEqual({ row: 3, col: 0 });
    expect(destinations(moves)).toContainEqual({ row: 3, col: 7 });
    expectSorted(moves);
  });

  it("returns correct candidates from a board edge", () => {
    const actor = unit({ id: "actor", position: { row: 0, col: 0 } });

    expect(destinations(movesFor(actor, [actor]))).toEqual([
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
      { row: 0, col: 4 },
      { row: 0, col: 5 },
      { row: 0, col: 6 },
      { row: 0, col: 7 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
      { row: 3, col: 0 },
      { row: 4, col: 0 },
      { row: 5, col: 0 },
      { row: 6, col: 0 },
      { row: 7, col: 0 },
    ]);
  });

  it("excludes friendly squares from move candidates", () => {
    const actor = unit({ id: "actor" });
    const friendly = unit({ id: "friendly", position: { row: 3, col: 4 } });
    const moves = movesFor(actor, [actor, friendly]);

    expect(destinations(moves)).not.toContainEqual({ row: 3, col: 4 });
  });

  it("allows movement to empty squares beyond friendly units", () => {
    const actor = unit({ id: "actor" });
    const friendly = unit({ id: "friendly", position: { row: 2, col: 3 } });
    const moves = movesFor(actor, [actor, friendly]);

    expect(destinations(moves)).not.toContainEqual({ row: 2, col: 3 });
    expect(destinations(moves)).toContainEqual({ row: 1, col: 3 });
    expect(destinations(moves)).toContainEqual({ row: 0, col: 3 });
    expectSorted(moves);
  });

  it("includes enemy squares as engage and blocks beyond them", () => {
    const actor = unit({ id: "actor" });
    const enemy = unit({
      id: "enemy",
      ownerId: playerB,
      position: { row: 3, col: 5 },
    });
    const moves = movesFor(actor, [actor, enemy]);

    expect(moves).toContainEqual({
      destination: { row: 3, col: 5 },
      kind: "engage",
    });
    expect(destinations(moves)).not.toContainEqual({ row: 3, col: 6 });
    expect(destinations(moves)).toContainEqual({ row: 2, col: 3 });
  });
});

describe("diagonal movement", () => {
  it("moves from the center across all diagonal lines", () => {
    const actor = unit({
      id: "actor",
      movementType: "diagonal",
      movementRule: diagonalRule,
    });
    const moves = movesFor(actor, [actor]);

    expect(moves).toHaveLength(13);
    expect(destinations(moves)).toContainEqual({ row: 0, col: 0 });
    expect(destinations(moves)).toContainEqual({ row: 0, col: 6 });
    expect(destinations(moves)).toContainEqual({ row: 6, col: 0 });
    expect(destinations(moves)).toContainEqual({ row: 7, col: 7 });
  });

  it("handles board edges", () => {
    const actor = unit({
      id: "actor",
      position: { row: 0, col: 0 },
      movementType: "diagonal",
      movementRule: diagonalRule,
    });

    expect(destinations(movesFor(actor, [actor]))).toEqual([
      { row: 1, col: 1 },
      { row: 2, col: 2 },
      { row: 3, col: 3 },
      { row: 4, col: 4 },
      { row: 5, col: 5 },
      { row: 6, col: 6 },
      { row: 7, col: 7 },
    ]);
  });

  it("passes through friendly units and stops at enemies", () => {
    const actor = unit({
      id: "actor",
      movementType: "diagonal",
      movementRule: diagonalRule,
    });
    const friendly = unit({ id: "friendly", position: { row: 2, col: 2 } });
    const enemy = unit({
      id: "enemy",
      ownerId: playerB,
      position: { row: 1, col: 1 },
    });
    const moves = movesFor(actor, [actor, friendly, enemy]);

    expect(destinations(moves)).not.toContainEqual({ row: 2, col: 2 });
    expect(moves).toContainEqual({
      destination: { row: 1, col: 1 },
      kind: "engage",
    });
    expect(destinations(moves)).not.toContainEqual({ row: 0, col: 0 });
  });
});

describe("adjacent movement", () => {
  it("returns eight surrounding squares from the center", () => {
    const actor = unit({
      id: "actor",
      movementType: "adjacent",
      movementRule: adjacentRule,
    });

    expect(destinations(movesFor(actor, [actor]))).toEqual([
      { row: 2, col: 2 },
      { row: 2, col: 3 },
      { row: 2, col: 4 },
      { row: 3, col: 2 },
      { row: 3, col: 4 },
      { row: 4, col: 2 },
      { row: 4, col: 3 },
      { row: 4, col: 4 },
    ]);
  });

  it("returns three squares from a corner", () => {
    const actor = unit({
      id: "actor",
      position: { row: 0, col: 0 },
      movementType: "adjacent",
      movementRule: adjacentRule,
    });

    expect(destinations(movesFor(actor, [actor]))).toEqual([
      { row: 0, col: 1 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ]);
  });

  it("excludes friendly squares and marks enemy squares as engage", () => {
    const actor = unit({
      id: "actor",
      movementType: "adjacent",
      movementRule: adjacentRule,
    });
    const friendly = unit({ id: "friendly", position: { row: 2, col: 2 } });
    const enemy = unit({
      id: "enemy",
      ownerId: playerB,
      position: { row: 2, col: 3 },
    });
    const moves = movesFor(actor, [actor, friendly, enemy]);

    expect(destinations(moves)).not.toContainEqual({ row: 2, col: 2 });
    expect(moves).toContainEqual({
      destination: { row: 2, col: 3 },
      kind: "engage",
    });
  });
});

describe("special offset movement", () => {
  it("uses injected offsets without hardcoding formal special coordinates", () => {
    const rule = specialOffsetRule([
      { row: -2, col: -1 },
      { row: -2, col: 1 },
      { row: 1, col: 2 },
      { row: 99, col: 99 },
    ]);
    const actor = unit({
      id: "actor",
      movementType: "special_offset",
      movementRule: rule,
    });
    const friendly = unit({ id: "friendly", position: { row: 1, col: 2 } });
    const enemy = unit({
      id: "enemy",
      ownerId: playerB,
      position: { row: 1, col: 4 },
    });

    expect(movesFor(actor, [actor, friendly, enemy], rule)).toEqual([
      { destination: { row: 1, col: 4 }, kind: "engage" },
      { destination: { row: 4, col: 5 }, kind: "move" },
    ]);
  });
});

describe("movement common validation and determinism", () => {
  it("returns errors for units that cannot move from the board", () => {
    const defeated = unit({ id: "defeated", status: "defeated" });
    const reserve = unit({ id: "reserve", status: "reserve", position: null });
    const withoutPosition = unit({ id: "without-position", position: null });

    expect(
      calculateLegalMoves({
        unit: defeated,
        units: [defeated],
        boardSize,
        movementRule: orthogonalRule,
        config: TACTICAL_DUEL_RULE_CONFIG,
      }),
    ).toMatchObject({ ok: false, error: { code: "UNIT_DEFEATED" } });
    expect(
      calculateLegalMoves({
        unit: reserve,
        units: [reserve],
        boardSize,
        movementRule: orthogonalRule,
        config: TACTICAL_DUEL_RULE_CONFIG,
      }),
    ).toMatchObject({ ok: false, error: { code: "UNIT_NOT_ON_BOARD" } });
    expect(
      calculateLegalMoves({
        unit: withoutPosition,
        units: [withoutPosition],
        boardSize,
        movementRule: orthogonalRule,
        config: TACTICAL_DUEL_RULE_CONFIG,
      }),
    ).toMatchObject({ ok: false, error: { code: "UNIT_NOT_ON_BOARD" } });
  });

  it("deduplicates destinations, sorts by row then col, and does not mutate inputs", () => {
    const duplicateRule: MovementRule = {
      kind: "line",
      directions: [
        { row: 0, col: 1 },
        { row: 0, col: 1 },
        { row: -1, col: 0 },
      ],
      maxDistance: 2,
    };
    const actor = unit({ id: "actor", movementRule: duplicateRule });
    const units = [actor] as const;
    const before = JSON.stringify(units);
    const moves = movesFor(actor, units, duplicateRule);

    expect(moves).toEqual([
      { destination: { row: 1, col: 3 }, kind: "move" },
      { destination: { row: 2, col: 3 }, kind: "move" },
      { destination: { row: 3, col: 4 }, kind: "move" },
      { destination: { row: 3, col: 5 }, kind: "move" },
    ]);
    expect(new Set(moves.map((move) => `${move.destination.row}:${move.destination.col}`)).size).toBe(
      moves.length,
    );
    expect(JSON.stringify(units)).toBe(before);
  });
});
