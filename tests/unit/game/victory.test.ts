import { describe, expect, it } from "vitest";

import {
  evaluateTacticalDuelVictory,
  getPlayerUnits,
  isPlayerAnnihilated,
  isPlayerFlagDestroyed,
  toCardId,
  toCharacterId,
  toMatchPlayerId,
  toPlayerId,
  toUnitId,
} from "../../../src/game";
import type {
  CardSnapshot,
  FlagState,
  GameEventPayload,
  MatchPlayerState,
  Result,
  RuleError,
  UnitState,
  VictoryEvaluation,
} from "../../../src/game";

const playerA = toMatchPlayerId("player-a");
const playerB = toMatchPlayerId("player-b");
const outsider = toMatchPlayerId("outsider");

const card = (key: string): CardSnapshot => ({
  cardId: toCardId(`card-${key}`),
  characterId: toCharacterId(`character-${key}`),
  characterKey: `character-${key}`,
  cardKey: `card-${key}`,
  cardName: `Test ${key}`,
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
  baseAttack: 1000,
  baseDefense: 1000,
  attribute: "neutral",
  artworkUrl: null,
  abilityData: {},
});

const flag = (
  ownerId: MatchPlayerState["id"],
  damage = 0,
  maxDamage = 3,
): FlagState => ({ ownerId, damage, maxDamage });

const player = ({
  id,
  damage = 0,
  maxDamage = 3,
  flagOwnerId = id,
}: {
  id: MatchPlayerState["id"];
  damage?: number;
  maxDamage?: number;
  flagOwnerId?: MatchPlayerState["id"];
}): MatchPlayerState => ({
  id,
  playerId: toPlayerId(`account-${id}`),
  side: id === playerA ? "south" : "north",
  reserveUnitIds: [],
  flag: flag(flagOwnerId, damage, maxDamage),
  connected: true,
});

const unit = ({
  id,
  ownerId,
  status = "board",
  position = status === "board" ? { row: 0, col: 0 } : null,
}: {
  id: string;
  ownerId: UnitState["ownerId"];
  status?: UnitState["status"];
  position?: UnitState["position"];
}): UnitState => ({
  id: toUnitId(id),
  ownerId,
  card: card(id),
  status,
  position,
  stance: "attack",
  currentDefense: status === "defeated" ? 0 : 1000,
});

const basePlayers = (): readonly MatchPlayerState[] => [
  player({ id: playerA }),
  player({ id: playerB }),
];

const baseUnits = (): readonly UnitState[] => [
  unit({ id: "a-1", ownerId: playerA, status: "board" }),
  unit({ id: "a-2", ownerId: playerA, status: "reserve" }),
  unit({ id: "b-1", ownerId: playerB, status: "board" }),
  unit({ id: "b-2", ownerId: playerB, status: "reserve" }),
];

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

const expectFinished = (
  result: Result<VictoryEvaluation, RuleError>,
): Extract<VictoryEvaluation, { finished: true }> => {
  const value = unwrap(result);
  expect(value.finished).toBe(true);

  if (!value.finished) {
    throw new Error("Expected a finished victory evaluation.");
  }

  return value;
};

const eventPayload = (
  value: Extract<VictoryEvaluation, { finished: true }>,
): GameEventPayload => {
  expect(value.events).toHaveLength(1);
  return value.events[0];
};

describe("isPlayerAnnihilated", () => {
  it("returns true when all owned units are defeated", () => {
    expect(
      unwrap(
        isPlayerAnnihilated({
          playerId: playerA,
          units: [
            unit({ id: "a-1", ownerId: playerA, status: "defeated" }),
            unit({ id: "a-2", ownerId: playerA, status: "defeated" }),
            unit({ id: "b-1", ownerId: playerB, status: "board" }),
          ],
        }),
      ),
    ).toBe(true);
  });

  it("returns false when a board unit remains", () => {
    expect(
      unwrap(
        isPlayerAnnihilated({
          playerId: playerA,
          units: [
            unit({ id: "a-1", ownerId: playerA, status: "defeated" }),
            unit({ id: "a-2", ownerId: playerA, status: "board" }),
          ],
        }),
      ),
    ).toBe(false);
  });

  it("returns false when a reserve unit remains", () => {
    expect(
      unwrap(
        isPlayerAnnihilated({
          playerId: playerA,
          units: [
            unit({ id: "a-1", ownerId: playerA, status: "defeated" }),
            unit({ id: "a-2", ownerId: playerA, status: "reserve" }),
          ],
        }),
      ),
    ).toBe(false);
  });

  it("returns false when no board units remain but reserve units remain", () => {
    expect(
      unwrap(
        isPlayerAnnihilated({
          playerId: playerA,
          units: [unit({ id: "a-1", ownerId: playerA, status: "reserve" })],
        }),
      ),
    ).toBe(false);
  });

  it("ignores other players' unit states", () => {
    expect(
      unwrap(
        isPlayerAnnihilated({
          playerId: playerA,
          units: [
            unit({ id: "a-1", ownerId: playerA, status: "defeated" }),
            unit({ id: "b-1", ownerId: playerB, status: "reserve" }),
          ],
        }),
      ),
    ).toBe(true);
  });

  it("returns an error when the player owns no units", () => {
    expectErrorCode(
      isPlayerAnnihilated({
        playerId: playerA,
        units: [unit({ id: "b-1", ownerId: playerB, status: "board" })],
      }),
      "PLAYER_HAS_NO_UNITS",
    );
  });

  it("uses status instead of position", () => {
    expect(
      unwrap(
        isPlayerAnnihilated({
          playerId: playerA,
          units: [
            unit({
              id: "a-1",
              ownerId: playerA,
              status: "board",
              position: null,
            }),
          ],
        }),
      ),
    ).toBe(false);
  });

  it("does not mutate the input unit array", () => {
    const units = [
      unit({ id: "a-2", ownerId: playerA, status: "defeated" }),
      unit({ id: "a-1", ownerId: playerA, status: "defeated" }),
    ];
    const before = structuredClone(units);

    unwrap(isPlayerAnnihilated({ playerId: playerA, units }));

    expect(units).toEqual(before);
  });

  it("returns player units in deterministic unit id order", () => {
    const units = [
      unit({ id: "a-2", ownerId: playerA }),
      unit({ id: "b-1", ownerId: playerB }),
      unit({ id: "a-1", ownerId: playerA }),
    ];

    expect(getPlayerUnits(units, playerA).map((ownedUnit) => ownedUnit.id)).toEqual([
      toUnitId("a-1"),
      toUnitId("a-2"),
    ]);
  });
});

describe("isPlayerFlagDestroyed", () => {
  it.each([
    { damage: 0, maxDamage: 3, expected: false },
    { damage: 2, maxDamage: 3, expected: false },
    { damage: 3, maxDamage: 3, expected: true },
    { damage: 4, maxDamage: 4, expected: true },
  ])("evaluates damage $damage / maxDamage $maxDamage", ({ damage, maxDamage, expected }) => {
    expect(
      unwrap(isPlayerFlagDestroyed(player({ id: playerA, damage, maxDamage }))),
    ).toBe(expected);
  });

  it("returns an error for an invalid flag state", () => {
    expectErrorCode(
      isPlayerFlagDestroyed(player({ id: playerA, damage: 4, maxDamage: 3 })),
      "INVALID_FLAG_STATE",
    );
  });

  it("returns an error for a flag owner mismatch", () => {
    expectErrorCode(
      isPlayerFlagDestroyed(player({ id: playerA, flagOwnerId: playerB })),
      "FLAG_OWNER_MISMATCH",
    );
  });
});

describe("evaluateTacticalDuelVictory", () => {
  it("returns unfinished with no events when neither victory condition is met", () => {
    const value = unwrap(
      evaluateTacticalDuelVictory({ players: basePlayers(), units: baseUnits() }),
    );

    expect(value).toEqual({ finished: false, events: [] });
  });

  it("returns player B victory when player A flag is destroyed", () => {
    const value = expectFinished(
      evaluateTacticalDuelVictory({
        players: [player({ id: playerA, damage: 3 }), player({ id: playerB })],
        units: baseUnits(),
      }),
    );

    expect(value.winnerPlayerId).toBe(playerB);
    expect(value.loserPlayerId).toBe(playerA);
    expect(value.reason).toBe("flag_destroyed");
    expect(eventPayload(value)).toEqual({
      type: "MATCH_FINISHED",
      winnerPlayerId: playerB,
      loserPlayerId: playerA,
      reason: "flag_destroyed",
    });
  });

  it("returns player A victory when player B flag is destroyed", () => {
    const value = expectFinished(
      evaluateTacticalDuelVictory({
        players: [player({ id: playerA }), player({ id: playerB, damage: 3 })],
        units: baseUnits(),
      }),
    );

    expect(value.winnerPlayerId).toBe(playerA);
    expect(value.loserPlayerId).toBe(playerB);
    expect(value.reason).toBe("flag_destroyed");
    expect(eventPayload(value)).toEqual({
      type: "MATCH_FINISHED",
      winnerPlayerId: playerA,
      loserPlayerId: playerB,
      reason: "flag_destroyed",
    });
  });

  it("returns player B victory when player A is annihilated", () => {
    const value = expectFinished(
      evaluateTacticalDuelVictory({
        players: basePlayers(),
        units: [
          unit({ id: "a-1", ownerId: playerA, status: "defeated" }),
          unit({ id: "a-2", ownerId: playerA, status: "defeated" }),
          unit({ id: "b-1", ownerId: playerB, status: "board" }),
        ],
      }),
    );

    expect(value.winnerPlayerId).toBe(playerB);
    expect(value.loserPlayerId).toBe(playerA);
    expect(value.reason).toBe("annihilation");
    expect(eventPayload(value)).toEqual({
      type: "MATCH_FINISHED",
      winnerPlayerId: playerB,
      loserPlayerId: playerA,
      reason: "annihilation",
    });
  });

  it("returns player A victory when player B is annihilated", () => {
    const value = expectFinished(
      evaluateTacticalDuelVictory({
        players: basePlayers(),
        units: [
          unit({ id: "a-1", ownerId: playerA, status: "reserve" }),
          unit({ id: "b-1", ownerId: playerB, status: "defeated" }),
          unit({ id: "b-2", ownerId: playerB, status: "defeated" }),
        ],
      }),
    );

    expect(value.winnerPlayerId).toBe(playerA);
    expect(value.loserPlayerId).toBe(playerB);
    expect(value.reason).toBe("annihilation");
  });

  it("does not award annihilation while a reserve unit remains", () => {
    const value = unwrap(
      evaluateTacticalDuelVictory({
        players: basePlayers(),
        units: [
          unit({ id: "a-1", ownerId: playerA, status: "defeated" }),
          unit({ id: "a-2", ownerId: playerA, status: "reserve" }),
          unit({ id: "b-1", ownerId: playerB, status: "board" }),
        ],
      }),
    );

    expect(value).toEqual({ finished: false, events: [] });
  });

  it("does not award annihilation when only board units are defeated and reserve remains", () => {
    const value = unwrap(
      evaluateTacticalDuelVictory({
        players: basePlayers(),
        units: [
          unit({ id: "a-board", ownerId: playerA, status: "defeated" }),
          unit({ id: "a-reserve", ownerId: playerA, status: "reserve" }),
          unit({ id: "b-1", ownerId: playerB, status: "board" }),
        ],
      }),
    );

    expect(value).toEqual({ finished: false, events: [] });
  });

  it("prioritizes flag destruction over annihilation for the same loser", () => {
    const value = expectFinished(
      evaluateTacticalDuelVictory({
        players: [player({ id: playerA, damage: 3 }), player({ id: playerB })],
        units: [
          unit({ id: "a-1", ownerId: playerA, status: "defeated" }),
          unit({ id: "a-2", ownerId: playerA, status: "defeated" }),
          unit({ id: "b-1", ownerId: playerB, status: "board" }),
        ],
      }),
    );

    expect(value.winnerPlayerId).toBe(playerB);
    expect(value.loserPlayerId).toBe(playerA);
    expect(value.reason).toBe("flag_destroyed");
    expect(value.events).toHaveLength(1);
  });

  it.each([
    {
      name: "both flags are destroyed",
      players: [player({ id: playerA, damage: 3 }), player({ id: playerB, damage: 3 })],
      units: baseUnits(),
    },
    {
      name: "both players are annihilated",
      players: basePlayers(),
      units: [
        unit({ id: "a-1", ownerId: playerA, status: "defeated" }),
        unit({ id: "b-1", ownerId: playerB, status: "defeated" }),
      ],
    },
    {
      name: "one flag is destroyed and the other player is annihilated",
      players: [player({ id: playerA, damage: 3 }), player({ id: playerB })],
      units: [
        unit({ id: "a-1", ownerId: playerA, status: "board" }),
        unit({ id: "b-1", ownerId: playerB, status: "defeated" }),
      ],
    },
  ])("returns AMBIGUOUS_VICTORY_STATE when $name", ({ players, units }) => {
    const error = expectErrorCode(
      evaluateTacticalDuelVictory({ players, units }),
      "AMBIGUOUS_VICTORY_STATE",
    );

    expect(error.details).toBeDefined();
  });

  it.each([
    { players: [], expected: "INVALID_PLAYER_COUNT" },
    { players: [player({ id: playerA })], expected: "INVALID_PLAYER_COUNT" },
    {
      players: [player({ id: playerA }), player({ id: playerB }), player({ id: outsider })],
      expected: "INVALID_PLAYER_COUNT",
    },
  ] as const)("rejects invalid player count %#", ({ players, expected }) => {
    expectErrorCode(
      evaluateTacticalDuelVictory({ players, units: baseUnits() }),
      expected,
    );
  });

  it("rejects duplicate player ids", () => {
    expectErrorCode(
      evaluateTacticalDuelVictory({
        players: [player({ id: playerA }), player({ id: playerA })],
        units: baseUnits(),
      }),
      "DUPLICATE_MATCH_PLAYER",
    );
  });

  it("rejects a flag owner mismatch", () => {
    expectErrorCode(
      evaluateTacticalDuelVictory({
        players: [player({ id: playerA, flagOwnerId: playerB }), player({ id: playerB })],
        units: baseUnits(),
      }),
      "FLAG_OWNER_MISMATCH",
    );
  });

  it("rejects players with no units", () => {
    expectErrorCode(
      evaluateTacticalDuelVictory({
        players: basePlayers(),
        units: [unit({ id: "a-1", ownerId: playerA })],
      }),
      "PLAYER_HAS_NO_UNITS",
    );
  });

  it("rejects unknown unit owners", () => {
    expectErrorCode(
      evaluateTacticalDuelVictory({
        players: basePlayers(),
        units: [...baseUnits(), unit({ id: "x-1", ownerId: outsider })],
      }),
      "UNKNOWN_UNIT_OWNER",
    );
  });

  it("rejects duplicate unit ids", () => {
    expectErrorCode(
      evaluateTacticalDuelVictory({
        players: basePlayers(),
        units: [
          unit({ id: "duplicate", ownerId: playerA }),
          unit({ id: "duplicate", ownerId: playerB }),
        ],
      }),
      "DUPLICATE_UNIT",
    );
  });

  it("does not mutate input players, units, or flags", () => {
    const players = [player({ id: playerA, damage: 3 }), player({ id: playerB })];
    const units = baseUnits();
    const playersBefore = structuredClone(players);
    const unitsBefore = structuredClone(units);

    expectFinished(evaluateTacticalDuelVictory({ players, units }));

    expect(players).toEqual(playersBefore);
    expect(units).toEqual(unitsBefore);
  });

  it("returns the same result when player and unit array order changes", () => {
    const players = [player({ id: playerA, damage: 3 }), player({ id: playerB })];
    const units = baseUnits();
    const normal = unwrap(evaluateTacticalDuelVictory({ players, units }));
    const reordered = unwrap(
      evaluateTacticalDuelVictory({
        players: [...players].reverse(),
        units: [...units].reverse(),
      }),
    );

    expect(reordered).toEqual(normal);
  });

  it("returns identical results for identical input", () => {
    const input = {
      players: [player({ id: playerA }), player({ id: playerB, damage: 3 })],
      units: baseUnits(),
    };

    expect(evaluateTacticalDuelVictory(input)).toEqual(
      evaluateTacticalDuelVictory(input),
    );
  });
});
