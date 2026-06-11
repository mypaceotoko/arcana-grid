import { describe, expect, it } from "vitest";

import {
  getBoardUnits,
  getSquareOccupancy,
  getUnitAtCoordinate,
  toCardId,
  toCharacterId,
  toMatchPlayerId,
  toUnitId,
} from "../../../src/game";
import type { CardSnapshot, UnitState } from "../../../src/game";

const playerA = toMatchPlayerId("player-a");
const playerB = toMatchPlayerId("player-b");

const card: CardSnapshot = {
  cardId: toCardId("card"),
  characterId: toCharacterId("character"),
  characterKey: "character",
  cardKey: "card",
  cardName: "Test Card",
  movementType: "orthogonal",
  movementRule: {
    kind: "line",
    directions: [{ row: -1, col: 0 }],
    maxDistance: null,
  },
  baseAttack: 1,
  baseDefense: 1,
  attribute: "neutral",
  artworkUrl: null,
  abilityData: {},
};

const unit = (
  id: string,
  ownerId = playerA,
  position: UnitState["position"] = { row: 1, col: 1 },
  status: UnitState["status"] = "board",
): UnitState => ({
  id: toUnitId(id),
  ownerId,
  card,
  status,
  position,
  stance: "attack",
  currentDefense: 1,
});

describe("board occupancy utilities", () => {
  it("only includes units with board status and a position", () => {
    expect(
      getBoardUnits([
        unit("on-board"),
        unit("reserve", playerA, null, "reserve"),
        unit("defeated", playerA, { row: 2, col: 2 }, "defeated"),
      ]).map((boardUnit) => boardUnit.id),
    ).toEqual([toUnitId("on-board")]);
  });

  it("finds units and classifies occupancy relative to the current player", () => {
    const units = [unit("friendly"), unit("enemy", playerB, { row: 2, col: 2 })];

    expect(getUnitAtCoordinate(units, { row: 1, col: 1 })?.id).toBe(
      toUnitId("friendly"),
    );
    expect(getSquareOccupancy(units, { row: 1, col: 1 }, playerA).kind).toBe(
      "friendly",
    );
    expect(getSquareOccupancy(units, { row: 2, col: 2 }, playerA).kind).toBe(
      "enemy",
    );
    expect(getSquareOccupancy(units, { row: 3, col: 3 }, playerA).kind).toBe(
      "empty",
    );
  });
});
