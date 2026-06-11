import { describe, expect, it } from "vitest";

import {
  canPlayerDeployReserve,
  deployReserveUnit,
  getPlayerBoardUnits,
  getPlayerReserveUnits,
  getReserveDeploymentCoordinates,
  isPlayerAnnihilated,
  toCardId,
  toCharacterId,
  toMatchPlayerId,
  toPlayerId,
  toUnitId,
  validateReserveDeployment,
} from "../../../src/game";
import type {
  BoardSize,
  CardSnapshot,
  MatchPlayerState,
  Result,
  RuleError,
  Stance,
  TacticalRuleConfig,
  UnitState,
} from "../../../src/game";
import { TACTICAL_DUEL_RULE_CONFIG } from "../../../src/game";

const playerNorth = toMatchPlayerId("player-north");
const playerSouth = toMatchPlayerId("player-south");
const boardSize: BoardSize = { width: 8, height: 8 };
const config: TacticalRuleConfig = TACTICAL_DUEL_RULE_CONFIG;

const card = (key: string, baseDefense = 1000): CardSnapshot => ({
  cardId: toCardId(`card-${key}`),
  characterId: toCharacterId(`character-${key}`),
  characterKey: `character-${key}`,
  cardKey: `card-${key}`,
  cardName: `Card ${key}`,
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
  baseDefense,
  attribute: "neutral",
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

const northPlayer = player(playerNorth, "north");
const southPlayer = player(playerSouth, "south");

const unit = ({
  id,
  ownerId = playerNorth,
  status = "board",
  position = status === "board" ? { row: 2, col: 0 } : null,
  stance = "attack",
  baseDefense = 1000,
  currentDefense = baseDefense,
}: {
  id: string;
  ownerId?: UnitState["ownerId"];
  status?: UnitState["status"];
  position?: UnitState["position"];
  stance?: UnitState["stance"];
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
  row = 2,
): UnitState[] =>
  Array.from({ length: count }, (_, index) =>
    unit({
      id: `${ownerId}-board-${index}`,
      ownerId,
      status: "board",
      position: { row, col: index },
    }),
  );

const reserveUnit = (id = "north-reserve"): UnitState =>
  unit({
    id,
    ownerId: playerNorth,
    status: "reserve",
    position: null,
    stance: "defense",
    baseDefense: 1200,
    currentDefense: 1,
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

const deploymentContext = (overrides: {
  player?: MatchPlayerState;
  unit?: UnitState;
  units?: readonly UnitState[];
  destination?: UnitState["position"];
  stance?: Stance;
  boardSize?: BoardSize;
  config?: TacticalRuleConfig;
} = {}) => {
  const reserve = overrides.unit ?? reserveUnit();

  return {
    player: overrides.player ?? northPlayer,
    unit: reserve,
    units:
      overrides.units ??
      [...boardUnits(playerNorth, 5), reserve, ...boardUnits(playerSouth, 1, 5)],
    destination: overrides.destination ?? { row: 1, col: 0 },
    stance: overrides.stance ?? "attack",
    boardSize: overrides.boardSize ?? boardSize,
    config: overrides.config ?? config,
  };
};

const cloneJson = (value: unknown): string => JSON.stringify(value);

describe("getPlayerBoardUnits", () => {
  it("returns only the player's board units with non-null positions in deterministic unit id order", () => {
    const units = [
      unit({ id: "z-board", ownerId: playerNorth, status: "board", position: { row: 1, col: 0 } }),
      unit({ id: "reserve", ownerId: playerNorth, status: "reserve" }),
      unit({ id: "defeated", ownerId: playerNorth, status: "defeated" }),
      unit({ id: "enemy-board", ownerId: playerSouth, status: "board", position: { row: 5, col: 0 } }),
      unit({ id: "a-board", ownerId: playerNorth, status: "board", position: { row: 1, col: 1 } }),
      unit({ id: "null-board", ownerId: playerNorth, status: "board", position: null }),
    ];
    const before = cloneJson(units);

    expect(getPlayerBoardUnits(units, playerNorth).map((ownedUnit) => ownedUnit.id)).toEqual([
      toUnitId("a-board"),
      toUnitId("z-board"),
    ]);
    expect(cloneJson(units)).toBe(before);
  });
});

describe("getPlayerReserveUnits", () => {
  it("returns only the player's reserve units in deterministic unit id order without mutation", () => {
    const units = [
      unit({ id: "z-reserve", ownerId: playerNorth, status: "reserve" }),
      unit({ id: "board", ownerId: playerNorth, status: "board", position: { row: 1, col: 0 } }),
      unit({ id: "defeated", ownerId: playerNorth, status: "defeated" }),
      unit({ id: "enemy-reserve", ownerId: playerSouth, status: "reserve" }),
      unit({ id: "a-reserve", ownerId: playerNorth, status: "reserve" }),
    ];
    const before = cloneJson(units);

    expect(getPlayerReserveUnits(units, playerNorth).map((ownedUnit) => ownedUnit.id)).toEqual([
      toUnitId("a-reserve"),
      toUnitId("z-reserve"),
    ]);
    expect(cloneJson(units)).toBe(before);
  });
});

describe("canPlayerDeployReserve", () => {
  it("returns true with five board units and a reserve", () => {
    expect(
      unwrap(
        canPlayerDeployReserve({
          playerId: playerNorth,
          units: [...boardUnits(playerNorth, 5), reserveUnit()],
          config,
        }),
      ),
    ).toBe(true);
  });

  it("returns true with zero board units and a reserve", () => {
    expect(
      unwrap(
        canPlayerDeployReserve({
          playerId: playerNorth,
          units: [reserveUnit()],
          config,
        }),
      ),
    ).toBe(true);
  });

  it("returns false with six board units even when reserve remains", () => {
    expect(
      unwrap(
        canPlayerDeployReserve({
          playerId: playerNorth,
          units: [...boardUnits(playerNorth, 6), reserveUnit()],
          config,
        }),
      ),
    ).toBe(false);
  });

  it("returns false without reserve units", () => {
    expect(
      unwrap(
        canPlayerDeployReserve({
          playerId: playerNorth,
          units: boardUnits(playerNorth, 5),
          config,
        }),
      ),
    ).toBe(false);
  });

  it("errors when the player owns no units and ignores other player units", () => {
    expectErrorCode(
      canPlayerDeployReserve({
        playerId: playerNorth,
        units: [...boardUnits(playerSouth, 6), unit({ id: "south-reserve", ownerId: playerSouth, status: "reserve" })],
        config,
      }),
      "PLAYER_HAS_NO_UNITS",
    );
  });
});

describe("getReserveDeploymentCoordinates", () => {
  it("returns north empty deployment coordinates in the upper placement rows excluding flag and occupied squares", () => {
    const units = [
      unit({ id: "friendly", ownerId: playerNorth, status: "board", position: { row: 0, col: 0 } }),
      unit({ id: "enemy", ownerId: playerSouth, status: "board", position: { row: 1, col: 7 } }),
      reserveUnit(),
    ];

    const coordinates = unwrap(
      getReserveDeploymentCoordinates({ player: northPlayer, units, boardSize, config }),
    );

    expect(coordinates).not.toContainEqual({ row: 0, col: 0 });
    expect(coordinates).not.toContainEqual({ row: 1, col: 7 });
    expect(coordinates).not.toContainEqual({ row: 0, col: 3 });
    expect(coordinates).not.toContainEqual({ row: 0, col: 4 });
    expect(coordinates).toContainEqual({ row: 0, col: 1 });
    expect(coordinates).toContainEqual({ row: 1, col: 6 });
    expect(coordinates.every((coordinate) => coordinate.row === 0 || coordinate.row === 1)).toBe(true);
    expect(coordinates).toEqual([...coordinates].sort((left, right) => {
      const rowDiff = left.row - right.row;
      return rowDiff === 0 ? left.col - right.col : rowDiff;
    }));
    expect(new Set(coordinates.map((coordinate) => `${coordinate.row}:${coordinate.col}`)).size).toBe(coordinates.length);
  });

  it("returns south empty deployment coordinates in the lower placement rows", () => {
    const coordinates = unwrap(
      getReserveDeploymentCoordinates({ player: southPlayer, units: [reserveUnit()], boardSize, config }),
    );

    expect(coordinates.every((coordinate) => coordinate.row === 6 || coordinate.row === 7)).toBe(true);
    expect(coordinates).not.toContainEqual({ row: 7, col: 3 });
    expect(coordinates).not.toContainEqual({ row: 7, col: 4 });
  });

  it("supports board size and placement depth changes", () => {
    const customConfig = { ...config, initialPlacementDepth: 3 };
    const customBoard: BoardSize = { width: 6, height: 6 };

    const coordinates = unwrap(
      getReserveDeploymentCoordinates({
        player: northPlayer,
        units: [],
        boardSize: customBoard,
        config: customConfig,
      }),
    );

    expect(coordinates).toHaveLength(16);
    expect(coordinates).toContainEqual({ row: 2, col: 5 });
    expect(coordinates).not.toContainEqual({ row: 0, col: 2 });
    expect(coordinates).not.toContainEqual({ row: 0, col: 3 });
  });

  it("is deterministic for different input unit order and does not mutate inputs", () => {
    const units = [
      unit({ id: "b", ownerId: playerNorth, status: "board", position: { row: 0, col: 2 } }),
      unit({ id: "a", ownerId: playerSouth, status: "board", position: { row: 1, col: 2 } }),
    ];
    const reversed = [...units].reverse();
    const before = cloneJson({ units, boardSize, config });

    expect(unwrap(getReserveDeploymentCoordinates({ player: northPlayer, units, boardSize, config }))).toEqual(
      unwrap(getReserveDeploymentCoordinates({ player: northPlayer, units: reversed, boardSize, config })),
    );
    expect(cloneJson({ units, boardSize, config })).toBe(before);
  });

  it("returns an empty array when no legal deployment square remains", () => {
    const fullInitialArea = Array.from({ length: 16 }, (_, index) =>
      unit({
        id: `occupant-${index}`,
        ownerId: index % 2 === 0 ? playerNorth : playerSouth,
        status: "board",
        position: { row: Math.floor(index / 8), col: index % 8 },
      }),
    );

    expect(
      unwrap(
        getReserveDeploymentCoordinates({
          player: northPlayer,
          units: fullInitialArea,
          boardSize,
          config,
        }),
      ),
    ).toEqual([]);
  });
});

describe("deployReserveUnit", () => {
  it("deploys one reserve as a board unit, resets defense, preserves ids and card, and emits no secret card data", () => {
    const reserve = reserveUnit();
    const beforeUnit = cloneJson(reserve);
    const units = [...boardUnits(playerNorth, 5), reserve, ...boardUnits(playerSouth, 1, 5)];
    const beforeUnits = cloneJson(units);

    const result = unwrap(
      deployReserveUnit(
        deploymentContext({ unit: reserve, units, destination: { row: 1, col: 1 }, stance: "defense" }),
      ),
    );

    expect(result.unit).toMatchObject({
      id: reserve.id,
      ownerId: reserve.ownerId,
      status: "board",
      position: { row: 1, col: 1 },
      stance: "defense",
      currentDefense: reserve.card.baseDefense,
    });
    expect(result.unit.card).toBe(reserve.card);
    expect(result.destination).toEqual({ row: 1, col: 1 });
    expect(result.events).toEqual([
      {
        type: "RESERVE_DEPLOYED",
        unitId: reserve.id,
        ownerId: reserve.ownerId,
        destination: { row: 1, col: 1 },
        stance: "defense",
      },
    ]);
    expect(result.events[0]).not.toHaveProperty("cardName");
    expect(result.events[0]).not.toHaveProperty("baseAttack");
    expect(result.events[0]).not.toHaveProperty("baseDefense");
    expect(result.events[0]).not.toHaveProperty("artworkUrl");
    expect(cloneJson(reserve)).toBe(beforeUnit);
    expect(cloneJson(units)).toBe(beforeUnits);
  });

  it("deploys in attack stance", () => {
    expect(unwrap(deployReserveUnit(deploymentContext({ stance: "attack" }))).unit.stance).toBe("attack");
  });

  it("deploys in defense stance", () => {
    expect(unwrap(deployReserveUnit(deploymentContext({ stance: "defense" }))).unit.stance).toBe("defense");
  });
});

describe("validateReserveDeployment failures", () => {
  it("rejects another player's reserve", () => {
    const enemyReserve = unit({ id: "enemy-reserve", ownerId: playerSouth, status: "reserve" });

    expectErrorCode(
      validateReserveDeployment(deploymentContext({ unit: enemyReserve, units: [enemyReserve] })),
      "RESERVE_OWNER_MISMATCH",
    );
  });

  it.each([
    { status: "board" as const, code: "UNIT_NOT_IN_RESERVE" as const },
    { status: "defeated" as const, code: "UNIT_NOT_IN_RESERVE" as const },
  ])("rejects a $status unit", ({ status, code }) => {
    const target = unit({ id: `target-${status}`, ownerId: playerNorth, status });

    expectErrorCode(
      validateReserveDeployment(deploymentContext({ unit: target, units: [target] })),
      code,
    );
  });

  it("rejects a reserve with a non-null position", () => {
    const target = unit({ id: "bad-reserve", ownerId: playerNorth, status: "reserve", position: { row: 1, col: 0 } });

    expectErrorCode(
      validateReserveDeployment(deploymentContext({ unit: target, units: [target] })),
      "UNIT_NOT_IN_RESERVE",
    );
  });

  it("rejects when six board units are already present", () => {
    const reserve = reserveUnit();

    expectErrorCode(
      validateReserveDeployment(deploymentContext({ units: [...boardUnits(playerNorth, 6), reserve], unit: reserve })),
      "RESERVE_DEPLOYMENT_LIMIT_REACHED",
    );
  });

  it("rejects initial placement area, board, occupied, flag, baseDefense, duplicate, and missing reserve errors", () => {
    const reserve = reserveUnit();

    expectErrorCode(
      validateReserveDeployment(deploymentContext({ unit: reserve, units: [reserve], destination: { row: 2, col: 0 } })),
      "INVALID_RESERVE_DESTINATION",
    );
    expectErrorCode(
      validateReserveDeployment(deploymentContext({ unit: reserve, units: [reserve], destination: { row: -1, col: 0 } })),
      "OUT_OF_BOUNDS",
    );
    expectErrorCode(
      validateReserveDeployment(
        deploymentContext({
          unit: reserve,
          units: [reserve, unit({ id: "occupant", ownerId: playerSouth, status: "board", position: { row: 1, col: 0 } })],
          destination: { row: 1, col: 0 },
        }),
      ),
      "RESERVE_DESTINATION_OCCUPIED",
    );
    expectErrorCode(
      validateReserveDeployment(deploymentContext({ unit: reserve, units: [reserve], destination: { row: 0, col: 3 } })),
      "RESERVE_DESTINATION_IS_FLAG",
    );

    const invalidDefense = unit({ id: "bad-defense", ownerId: playerNorth, status: "reserve", baseDefense: Number.NaN });
    expectErrorCode(
      validateReserveDeployment(deploymentContext({ unit: invalidDefense, units: [invalidDefense] })),
      "INVALID_UNIT_BASE_DEFENSE",
    );

    const duplicate = reserveUnit("duplicate");
    expectErrorCode(
      validateReserveDeployment(deploymentContext({ unit: duplicate, units: [duplicate, duplicate] })),
      "DUPLICATE_UNIT",
    );

    expectErrorCode(
      deployReserveUnit(deploymentContext({ unit: reserve, units: boardUnits(playerNorth, 5) })),
      "RESERVE_UNIT_NOT_FOUND",
    );
  });

  it("does not produce events when deployment fails", () => {
    const result = deployReserveUnit(deploymentContext({ destination: { row: 0, col: 3 } }));

    expect(result.ok).toBe(false);
  });
});

describe("reserve deployment and annihilation consistency", () => {
  it("keeps remaining reserve units and deployed board units compatible with annihilation checks", () => {
    const firstReserve = reserveUnit("first-reserve");
    const secondReserve = reserveUnit("second-reserve");
    const defeated = unit({ id: "defeated", ownerId: playerNorth, status: "defeated" });

    expect(
      unwrap(
        isPlayerAnnihilated({
          playerId: playerNorth,
          units: [defeated, firstReserve, secondReserve],
        }),
      ),
    ).toBe(false);

    const deployed = unwrap(
      deployReserveUnit(
        deploymentContext({
          unit: firstReserve,
          units: [defeated, firstReserve, secondReserve],
          destination: { row: 1, col: 0 },
        }),
      ),
    ).unit;

    expect(deployed.status).toBe("board");
    expect(
      unwrap(
        isPlayerAnnihilated({
          playerId: playerNorth,
          units: [defeated, deployed, secondReserve],
        }),
      ),
    ).toBe(false);
  });
});
