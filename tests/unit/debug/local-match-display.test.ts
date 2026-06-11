import { describe, expect, it } from "vitest";

import { buildPlayerMatchView } from "../../../src/game";
import {
  buildBoardRows,
  describeUnit,
  getDisplayColumns,
  getDisplayRows,
} from "../../../src/app/debug/local-match/display";
import {
  LOCAL_DEBUG_CARD_BACK_KEY,
  LOCAL_DEBUG_MATCH_PLAYER_IDS,
  localDebugMatchState,
} from "../../../src/app/debug/local-match/fixture";

const buildView = (viewerId: typeof LOCAL_DEBUG_MATCH_PLAYER_IDS.south) => {
  const result = buildPlayerMatchView({
    state: localDebugMatchState,
    viewerId,
    cardBackKey: LOCAL_DEBUG_CARD_BACK_KEY,
  });

  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

describe("local debug match display helpers", () => {
  it("keeps internal coordinates unchanged while flipping display order for the north viewer", () => {
    expect(getDisplayRows(8, "south")).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(getDisplayColumns(8, "south")).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(getDisplayRows(8, "north")).toEqual([7, 6, 5, 4, 3, 2, 1, 0]);
    expect(getDisplayColumns(8, "north")).toEqual([7, 6, 5, 4, 3, 2, 1, 0]);
  });

  it("builds an 8x8 board from PlayerMatchView units without reading MatchState.units", () => {
    const view = buildView(LOCAL_DEBUG_MATCH_PLAYER_IDS.south);
    const rows = buildBoardRows(view, "south");

    expect(rows).toHaveLength(8);
    expect(rows.every((row) => row.cells.length === 8)).toBe(true);
    expect(rows[1]?.cells[2]?.unit?.unitId).toBe("local-debug-north-hidden-shade");
    expect(rows[6]?.cells[3]?.unit?.unitId).toBe("local-debug-south-aegis");
  });

  it("does not add card details to hidden unit detail models", () => {
    const view = buildView(LOCAL_DEBUG_MATCH_PLAYER_IDS.south);
    const hiddenUnit = view.units.find(
      (unit) => unit.unitId === "local-debug-north-hidden-shade",
    );

    expect(hiddenUnit?.revealed).toBe(false);
    if (hiddenUnit === undefined) throw new Error("missing hidden unit");

    const detail = describeUnit(hiddenUnit);
    expect(detail).toEqual({
      unitId: "local-debug-north-hidden-shade",
      ownerId: LOCAL_DEBUG_MATCH_PLAYER_IDS.north,
      status: "board",
      positionLabel: "r1 / c2",
      visibilityLabel: "伏せ",
      cardBackKey: LOCAL_DEBUG_CARD_BACK_KEY,
    });
    expect(JSON.stringify(detail)).not.toContain("North Hidden Shade");
    expect(JSON.stringify(detail)).not.toContain("baseAttack");
    expect(JSON.stringify(detail)).not.toContain("movementType");
  });

  it("shows revealed and owner unit details only when PlayerMatchView exposes them", () => {
    const view = buildView(LOCAL_DEBUG_MATCH_PLAYER_IDS.south);
    const ownUnit = view.units.find(
      (unit) => unit.unitId === "local-debug-south-aegis",
    );
    const revealedOpponent = view.units.find(
      (unit) => unit.unitId === "local-debug-north-revealed-oracle",
    );

    expect(ownUnit?.revealed).toBe(true);
    expect(revealedOpponent?.revealed).toBe(true);
    if (ownUnit === undefined || revealedOpponent === undefined) {
      throw new Error("missing revealed units");
    }

    expect(describeUnit(ownUnit)).toMatchObject({
      cardName: "South Aegis",
      baseAttack: 1400,
      baseDefense: 2400,
      visibilityLabel: "公開",
    });
    expect(describeUnit(revealedOpponent)).toMatchObject({
      cardName: "North Revealed Oracle",
      currentDefense: 1700,
      visibilityLabel: "公開",
    });
  });
});
