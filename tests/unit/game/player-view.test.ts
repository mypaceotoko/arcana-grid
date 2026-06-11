import { describe, expect, it } from "vitest";

import {
  buildPlayerMatchView,
  buildPlayerMatchViews,
  buildUnitView,
  toCardId,
  toCharacterId,
  toMatchId,
  toMatchPlayerId,
  toPlayerId,
  toRulesVersion,
  toUnitId,
} from "../../../src/game";
import type {
  CardSnapshot,
  MatchPlayerState,
  MatchState,
  UnitState,
  UnitView,
  UnitVisibility,
} from "../../../src/game";

const playerA = toMatchPlayerId("match-player-a");
const playerB = toMatchPlayerId("match-player-b");
const outsider = toMatchPlayerId("match-player-outsider");
const cardBackKey = "arcana-grid-default-back";

const secretValues = {
  cardName: "Opponent Secret Name",
  characterKey: "opponent-secret-character",
  cardKey: "opponent-secret-card",
  artworkUrl: "https://example.test/opponent-secret.png",
  abilityValue: "opponent-secret-ability",
  rarity: "legendary-secret",
};

const card = (key: string, overrides: Partial<CardSnapshot> = {}): CardSnapshot => ({
  cardId: toCardId(`card-${key}`),
  characterId: toCharacterId(`character-${key}`),
  characterKey: `character-${key}`,
  cardKey: `card-${key}`,
  cardName: `Card ${key}`,
  movementType: "diagonal",
  movementRule: {
    kind: "line",
    directions: [
      { row: 1, col: 1 },
      { row: -1, col: -1 },
    ],
    maxDistance: 2,
  },
  baseAttack: 1800,
  baseDefense: 2200,
  attribute: "fire",
  rarity: "rare",
  artworkUrl: `https://example.test/${key}.png`,
  abilityData: { ability: key },
  ...overrides,
});

const unit = ({
  id,
  ownerId,
  status = "board",
  position = { row: 0, col: 0 },
  cardOverrides = {},
}: {
  id: string;
  ownerId: UnitState["ownerId"];
  status?: UnitState["status"];
  position?: UnitState["position"];
  cardOverrides?: Partial<CardSnapshot>;
}): UnitState => ({
  id: toUnitId(id),
  ownerId,
  card: card(id, cardOverrides),
  status,
  position,
  stance: "defense",
  currentDefense: 2200,
});

const player = (id: typeof playerA | typeof playerB): MatchPlayerState => ({
  id,
  playerId: toPlayerId(`account-${id}`),
  side: id === playerA ? "south" : "north",
  reserveUnitIds: [],
  flag: { ownerId: id, damage: 0, maxDamage: 3 },
  connected: true,
});

const makeState = (visibilities: readonly UnitVisibility[] = []): MatchState => {
  const ownUnit = unit({
    id: "a-unit",
    ownerId: playerA,
    position: { row: 5, col: 1 },
  });
  const hiddenBoardUnit = unit({
    id: "b-hidden-board",
    ownerId: playerB,
    position: { row: 1, col: 2 },
    cardOverrides: {
      cardName: secretValues.cardName,
      characterKey: secretValues.characterKey,
      cardKey: secretValues.cardKey,
      artworkUrl: secretValues.artworkUrl,
      abilityData: { ability: secretValues.abilityValue },
      rarity: secretValues.rarity,
      baseAttack: 9999,
      baseDefense: 8888,
    },
  });
  const hiddenReserveUnit = unit({
    id: "b-hidden-reserve",
    ownerId: playerB,
    status: "reserve",
    position: null,
    cardOverrides: {
      cardName: "Opponent Reserve Secret",
      characterKey: "opponent-reserve-character",
      artworkUrl: "https://example.test/reserve-secret.png",
      abilityData: { ability: "opponent-reserve-ability" },
    },
  });
  const revealedUnit = unit({
    id: "b-revealed",
    ownerId: playerB,
    position: { row: 1, col: 3 },
  });
  const playerAState = player(playerA);
  const playerBState = {
    ...player(playerB),
    reserveUnitIds: [hiddenReserveUnit.id],
  };

  return {
    id: toMatchId("match-1"),
    gameMode: "tactical_duel",
    rulesVersion: toRulesVersion("tactical_duel.v1"),
    boardSize: { width: 8, height: 8 },
    phase: "active",
    players: [playerBState, playerAState],
    units: [revealedUnit, hiddenReserveUnit, ownUnit, hiddenBoardUnit],
    unitVisibilities: [...visibilities],
    currentTurnPlayerId: playerA,
    turnNumber: 7,
    stateVersion: 42,
    winnerPlayerId: null,
    winReason: null,
  };
};

const expectRevealed = (view: UnitView): Extract<UnitView, { revealed: true }> => {
  expect(view.revealed).toBe(true);
  if (!view.revealed) throw new Error("expected revealed view");
  return view;
};

const expectHidden = (view: UnitView): Extract<UnitView, { revealed: false }> => {
  expect(view.revealed).toBe(false);
  if (view.revealed) throw new Error("expected hidden view");
  return view;
};

describe("buildUnitView", () => {
  it("returns a hidden view without secret fields for an unrevealed opponent unit", () => {
    const target = unit({
      id: "secret-unit",
      ownerId: playerB,
      cardOverrides: {
        cardName: secretValues.cardName,
        characterKey: secretValues.characterKey,
        artworkUrl: secretValues.artworkUrl,
        abilityData: { ability: secretValues.abilityValue },
        rarity: secretValues.rarity,
      },
    });
    const hidden = expectHidden(
      buildUnitView({
        unit: target,
        viewerId: playerA,
        visibilities: [],
        cardBackKey,
      }),
    );

    expect(hidden).toEqual({
      revealed: false,
      unitId: target.id,
      ownerId: playerB,
      position: { row: 0, col: 0 },
      status: "board",
      cardBackKey,
    });

    for (const secretKey of [
      "stance",
      "currentDefense",
      "card",
      "cardName",
      "movementType",
      "baseAttack",
      "baseDefense",
      "abilityData",
      "artworkUrl",
      "rarity",
    ]) {
      expect(secretKey in hidden).toBe(false);
    }

    const json = JSON.stringify(hidden);
    expect(json).not.toContain("cardName");
    expect(json).not.toContain(secretValues.cardName);
    expect(json).not.toContain("currentDefense");
    expect(json).not.toContain("stance");
    expect(json).not.toContain("movementType");
    expect(json).not.toContain("abilityData");
    expect(json).not.toContain(secretValues.abilityValue);
    expect(json).not.toContain("artworkUrl");
    expect(json).not.toContain(secretValues.artworkUrl);
    expect(json).not.toContain("rarity");
  });

  it("returns full details for the owner and for a revealed opponent unit", () => {
    const own = unit({ id: "own-unit", ownerId: playerA });
    const opponent = unit({ id: "opponent-unit", ownerId: playerB });
    const ownView = expectRevealed(
      buildUnitView({
        unit: own,
        viewerId: playerA,
        visibilities: [],
        cardBackKey,
      }),
    );
    const opponentView = expectRevealed(
      buildUnitView({
        unit: opponent,
        viewerId: playerA,
        visibilities: [
          { unitId: opponent.id, viewerId: playerA, level: "revealed" },
        ],
        cardBackKey,
      }),
    );

    for (const view of [ownView, opponentView]) {
      expect(view.stance).toBe("defense");
      expect(view.currentDefense).toBe(2200);
      expect(view.card.movementType).toBe("diagonal");
      expect(view.card.baseAttack).toBe(1800);
      expect(view.card.baseDefense).toBe(2200);
    }
  });
});

describe("buildPlayerMatchView", () => {
  it("rejects viewers that are not match participants", () => {
    const result = buildPlayerMatchView({
      state: makeState(),
      viewerId: outsider,
      cardBackKey,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("VIEWER_NOT_IN_MATCH");
  });

  it("builds a safe player view with own details, hidden opponent details, and revealed opponent details", () => {
    const state = makeState([
      {
        unitId: toUnitId("b-revealed"),
        viewerId: playerA,
        level: "revealed",
      },
    ]);
    const before = JSON.stringify(state);
    const result = buildPlayerMatchView({ state, viewerId: playerA, cardBackKey });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value).toMatchObject({
      matchId: state.id,
      gameMode: "tactical_duel",
      rulesVersion: state.rulesVersion,
      boardSize: { width: 8, height: 8 },
      phase: "active",
      currentTurnPlayerId: playerA,
      turnNumber: 7,
      stateVersion: 42,
      winnerPlayerId: null,
      winReason: null,
      viewerId: playerA,
    });

    const own = expectRevealed(result.value.units[0]);
    const hiddenBoard = expectHidden(result.value.units[1]);
    const hiddenReserve = expectHidden(result.value.units[2]);
    const revealed = expectRevealed(result.value.units[3]);

    expect(result.value.units.map((unitView) => unitView.unitId)).toEqual([
      toUnitId("a-unit"),
      toUnitId("b-hidden-board"),
      toUnitId("b-hidden-reserve"),
      toUnitId("b-revealed"),
    ]);
    expect(own.card.cardName).toBe("Card a-unit");
    expect(hiddenBoard.cardBackKey).toBe(cardBackKey);
    expect(hiddenReserve).toEqual({
      revealed: false,
      unitId: toUnitId("b-hidden-reserve"),
      ownerId: playerB,
      position: null,
      status: "reserve",
      cardBackKey,
    });
    expect(revealed.card.cardName).toBe("Card b-revealed");

    expect("stance" in hiddenBoard).toBe(false);
    expect("currentDefense" in hiddenBoard).toBe(false);
    expect("card" in hiddenReserve).toBe(false);
    expect(JSON.stringify(hiddenReserve)).not.toContain("Opponent Reserve Secret");
    expect(JSON.stringify(hiddenReserve)).not.toContain("opponent-reserve-ability");
    expect(JSON.stringify(hiddenBoard)).not.toContain(secretValues.cardName);
    expect(JSON.stringify(hiddenBoard)).not.toContain("currentDefense");
    expect(JSON.stringify(state)).toBe(before);
  });

  it("returns deterministic views for all players", () => {
    const state = makeState();
    const result = buildPlayerMatchViews(state, cardBackKey);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.map((view) => view.viewerId)).toEqual([playerA, playerB]);
    expect(result.value[0].units.map((view) => view.unitId)).toEqual([
      toUnitId("a-unit"),
      toUnitId("b-hidden-board"),
      toUnitId("b-hidden-reserve"),
      toUnitId("b-revealed"),
    ]);
  });
});
