import { describe, expect, it } from "vitest";

import {
  applyFlagDamage,
  getFlagAreaCoordinates,
  isCoordinateInFlagArea,
  isFlagAtMaximumDamage,
  toMatchPlayerId,
  validateFlagState,
} from "../../../src/game";
import type {
  ApplyFlagDamageResult,
  BoardSize,
  Coordinate,
  FlagState,
  GameEventPayload,
  Result,
  RuleError,
} from "../../../src/game";

const ownerId = toMatchPlayerId("flag-owner");
const board8x8: BoardSize = { width: 8, height: 8 };

const flag = (damage: number, maxDamage = 3): FlagState => ({
  ownerId,
  damage,
  maxDamage,
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
): void => {
  expect(result.ok).toBe(false);

  if (!result.ok) {
    expect(result.error.code).toBe(code);
  }
};

const uniqueCoordinateCount = (coordinates: readonly Coordinate[]): number =>
  new Set(coordinates.map((coordinate) => `${coordinate.row}:${coordinate.col}`))
    .size;

const eventTypes = (events: readonly GameEventPayload[]): readonly string[] =>
  events.map((event) => event.type);

describe("getFlagAreaCoordinates", () => {
  it("builds the north 8x8 flag area on row 0 with columns 3 and 4", () => {
    const coordinates = unwrap(
      getFlagAreaCoordinates({ side: "north", boardSize: board8x8 }),
    );

    expect(coordinates).toEqual([
      { row: 0, col: 3 },
      { row: 0, col: 4 },
    ]);
    expect(coordinates).toHaveLength(2);
    expect(uniqueCoordinateCount(coordinates)).toBe(2);
  });

  it("builds the south 8x8 flag area on row 7 with columns 3 and 4", () => {
    const coordinates = unwrap(
      getFlagAreaCoordinates({ side: "south", boardSize: board8x8 }),
    );

    expect(coordinates).toEqual([
      { row: 7, col: 3 },
      { row: 7, col: 4 },
    ]);
    expect(coordinates).toHaveLength(2);
    expect(uniqueCoordinateCount(coordinates)).toBe(2);
  });

  it("keeps returned coordinates sorted by row and column", () => {
    const coordinates = unwrap(
      getFlagAreaCoordinates({ side: "south", boardSize: board8x8 }),
    );

    expect(coordinates).toEqual([...coordinates].sort((left, right) => {
      const rowDiff = left.row - right.row;
      return rowDiff === 0 ? left.col - right.col : rowDiff;
    }));
  });

  it("uses the two center columns for an even width board", () => {
    expect(
      unwrap(
        getFlagAreaCoordinates({
          side: "north",
          boardSize: { width: 10, height: 6 },
        }),
      ),
    ).toEqual([
      { row: 0, col: 4 },
      { row: 0, col: 5 },
    ]);

    expect(
      unwrap(
        getFlagAreaCoordinates({
          side: "south",
          boardSize: { width: 10, height: 6 },
        }),
      ),
    ).toEqual([
      { row: 5, col: 4 },
      { row: 5, col: 5 },
    ]);
  });

  it("uses the single center column for odd width boards", () => {
    expect(
      unwrap(
        getFlagAreaCoordinates({
          side: "north",
          boardSize: { width: 7, height: 8 },
        }),
      ),
    ).toEqual([{ row: 0, col: 3 }]);

    expect(
      unwrap(
        getFlagAreaCoordinates({
          side: "south",
          boardSize: { width: 9, height: 8 },
        }),
      ),
    ).toEqual([{ row: 7, col: 4 }]);
  });

  it("does not mutate the input board size", () => {
    const boardSize: BoardSize = { width: 8, height: 8 };

    unwrap(getFlagAreaCoordinates({ side: "north", boardSize }));

    expect(boardSize).toEqual({ width: 8, height: 8 });
  });

  it.each([
    { width: 0, height: 8 },
    { width: 8, height: 0 },
    { width: -1, height: 8 },
    { width: 8, height: -1 },
    { width: 8.5, height: 8 },
    { width: 8, height: 8.5 },
    { width: Infinity, height: 8 },
    { width: 8, height: Infinity },
    { width: Number.NaN, height: 8 },
    { width: 8, height: Number.NaN },
  ])("rejects invalid board size %#", (boardSize) => {
    expectErrorCode(
      getFlagAreaCoordinates({ side: "north", boardSize }),
      "INVALID_BOARD_SIZE",
    );
  });
});

describe("isCoordinateInFlagArea", () => {
  it("returns true for a coordinate inside the flag area", () => {
    expect(
      unwrap(
        isCoordinateInFlagArea({
          coordinate: { row: 0, col: 3 },
          side: "north",
          boardSize: board8x8,
        }),
      ),
    ).toBe(true);
  });

  it("returns false for a coordinate outside the flag area", () => {
    expect(
      unwrap(
        isCoordinateInFlagArea({
          coordinate: { row: 1, col: 3 },
          side: "north",
          boardSize: board8x8,
        }),
      ),
    ).toBe(false);
  });

  it("returns false for the opposite side flag area", () => {
    expect(
      unwrap(
        isCoordinateInFlagArea({
          coordinate: { row: 7, col: 3 },
          side: "north",
          boardSize: board8x8,
        }),
      ),
    ).toBe(false);
  });

  it("returns OUT_OF_BOUNDS for a coordinate outside the board", () => {
    expectErrorCode(
      isCoordinateInFlagArea({
        coordinate: { row: -1, col: 3 },
        side: "north",
        boardSize: board8x8,
      }),
      "OUT_OF_BOUNDS",
    );
  });

  it("does not mutate the input coordinate or board size", () => {
    const coordinate: Coordinate = { row: 0, col: 4 };
    const boardSize: BoardSize = { width: 8, height: 8 };

    unwrap(isCoordinateInFlagArea({ coordinate, side: "north", boardSize }));

    expect(coordinate).toEqual({ row: 0, col: 4 });
    expect(boardSize).toEqual({ width: 8, height: 8 });
  });
});

describe("validateFlagState", () => {
  it.each([flag(0), flag(3)])("accepts valid flag state %#", (state) => {
    expect(unwrap(validateFlagState(state))).toEqual(state);
  });

  it.each([
    flag(-1),
    flag(0, 0),
    flag(4, 3),
    flag(1.5),
    flag(1, 3.5),
    flag(Infinity),
    flag(1, Infinity),
    flag(Number.NaN),
    flag(1, Number.NaN),
  ])("rejects invalid flag state %#", (state) => {
    expectErrorCode(validateFlagState(state), "INVALID_FLAG_STATE");
  });

  it("returns a copy instead of the input object", () => {
    const state = flag(1);
    const result = unwrap(validateFlagState(state));

    expect(result).toEqual(state);
    expect(result).not.toBe(state);
  });
});

describe("applyFlagDamage", () => {
  const applyOk = (state: FlagState, amount?: number): ApplyFlagDamageResult =>
    unwrap(applyFlagDamage({ flag: state, amount }));

  it("applies one damage by default", () => {
    const result = applyOk(flag(0));

    expect(result.flag.damage).toBe(1);
    expect(result.previousDamage).toBe(0);
    expect(result.appliedDamage).toBe(1);
    expect(result.reachedMaximum).toBe(false);
  });

  it.each([
    { previousDamage: 0, nextDamage: 1, reachedMaximum: false },
    { previousDamage: 1, nextDamage: 2, reachedMaximum: false },
    { previousDamage: 2, nextDamage: 3, reachedMaximum: true },
  ])("increments damage from $previousDamage to $nextDamage", (caseValue) => {
    const result = applyOk(flag(caseValue.previousDamage));

    expect(result.flag.damage).toBe(caseValue.nextDamage);
    expect(result.appliedDamage).toBe(1);
    expect(result.reachedMaximum).toBe(caseValue.reachedMaximum);
  });

  it("clamps damage to maxDamage when amount would exceed it", () => {
    const result = applyOk(flag(2), 5);

    expect(result.flag.damage).toBe(3);
    expect(result.appliedDamage).toBe(1);
    expect(result.reachedMaximum).toBe(true);
  });

  it("does not change an already maximum-damaged flag and emits no events", () => {
    const result = applyOk(flag(3), 1);

    expect(result.flag.damage).toBe(3);
    expect(result.appliedDamage).toBe(0);
    expect(result.reachedMaximum).toBe(true);
    expect(result.events).toEqual([]);
  });

  it.each([0, -1, 1.5, Infinity, Number.NaN])(
    "rejects invalid damage amount %s",
    (amount) => {
      expectErrorCode(
        applyFlagDamage({ flag: flag(0), amount }),
        "INVALID_FLAG_DAMAGE",
      );
    },
  );

  it("does not mutate the input flag state", () => {
    const state = flag(1);

    applyOk(state, 1);

    expect(state).toEqual(flag(1));
  });
});

describe("FLAG_DAMAGED event", () => {
  it("is generated only when actual damage increases", () => {
    expect(unwrap(applyFlagDamage({ flag: flag(0) })).events).toHaveLength(1);
    expect(unwrap(applyFlagDamage({ flag: flag(3) })).events).toHaveLength(0);
  });

  it("contains flag damage payload fields without finish events", () => {
    const result = unwrap(applyFlagDamage({ flag: flag(2), amount: 5 }));

    expect(result.events).toEqual([
      {
        type: "FLAG_DAMAGED",
        ownerId,
        previousDamage: 2,
        damage: 3,
        appliedDamage: 1,
        maxDamage: 3,
      },
    ]);
    expect(eventTypes(result.events)).not.toContain("MATCH_FINISHED");
  });
});

describe("isFlagAtMaximumDamage", () => {
  it.each([
    { state: flag(0), expected: false },
    { state: flag(2), expected: false },
    { state: flag(3), expected: true },
  ])("returns $expected for damage/maxDamage", ({ state, expected }) => {
    expect(unwrap(isFlagAtMaximumDamage(state))).toBe(expected);
  });

  it("returns an error for invalid FlagState", () => {
    expectErrorCode(isFlagAtMaximumDamage(flag(4)), "INVALID_FLAG_STATE");
  });
});
