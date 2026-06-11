import {
  TACTICAL_DUEL_RULE_CONFIG,
  TACTICAL_DUEL_RULES_VERSION,
  toCardId,
  toCharacterId,
  toMatchId,
  toMatchPlayerId,
  toPlayerId,
  toUnitId,
} from "@/game";
import type { CardSnapshot, MatchState, MovementRule, UnitState } from "@/game";

export const LOCAL_DEBUG_CARD_BACK_KEY = "arcana-grid-debug-card-back";

export const LOCAL_DEBUG_MATCH_PLAYER_IDS = {
  north: toMatchPlayerId("local-debug-north"),
  south: toMatchPlayerId("local-debug-south"),
} as const;

const orthogonalLineRule: MovementRule = {
  kind: "line",
  directions: [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ],
  maxDistance: 2,
};

const diagonalLineRule: MovementRule = {
  kind: "line",
  directions: [
    { row: -1, col: -1 },
    { row: -1, col: 1 },
    { row: 1, col: -1 },
    { row: 1, col: 1 },
  ],
  maxDistance: 2,
};

const adjacentRule: MovementRule = {
  kind: "offset",
  offsets: [
    { row: -1, col: 0 },
    { row: -1, col: 1 },
    { row: 0, col: 1 },
    { row: 1, col: 1 },
    { row: 1, col: 0 },
    { row: 1, col: -1 },
    { row: 0, col: -1 },
    { row: -1, col: -1 },
  ],
  canJump: false,
};

const makeCard = ({
  key,
  name,
  movementRule,
  movementType,
  baseAttack,
  baseDefense,
  attribute,
  rarity,
}: {
  key: string;
  name: string;
  movementRule: MovementRule;
  movementType: CardSnapshot["movementType"];
  baseAttack: number;
  baseDefense: number;
  attribute: CardSnapshot["attribute"];
  rarity: CardSnapshot["rarity"];
}): CardSnapshot => ({
  cardId: toCardId(`debug-card-${key}`),
  characterId: toCharacterId(`debug-character-${key}`),
  characterKey: `debug-character-${key}`,
  cardKey: `debug-card-${key}`,
  cardName: name,
  movementType,
  movementRule,
  baseAttack,
  baseDefense,
  attribute,
  rarity,
  artworkUrl: null,
  abilityData: { fixtureOnly: true, key },
});

const makeUnit = ({
  id,
  ownerId,
  card,
  row,
  col,
  stance,
  currentDefense,
  status = "board",
}: {
  id: string;
  ownerId: UnitState["ownerId"];
  card: CardSnapshot;
  row: number | null;
  col: number | null;
  stance: UnitState["stance"];
  currentDefense: number;
  status?: UnitState["status"];
}): UnitState => ({
  id: toUnitId(`local-debug-${id}`),
  ownerId,
  card,
  status,
  position: row === null || col === null ? null : { row, col },
  stance,
  currentDefense,
});

const cards = {
  southAegis: makeCard({
    key: "south-aegis",
    name: "South Aegis",
    movementRule: orthogonalLineRule,
    movementType: "orthogonal",
    baseAttack: 1400,
    baseDefense: 2400,
    attribute: "light",
    rarity: "rare",
  }),
  southBolt: makeCard({
    key: "south-bolt",
    name: "South Bolt",
    movementRule: diagonalLineRule,
    movementType: "diagonal",
    baseAttack: 1900,
    baseDefense: 1500,
    attribute: "lightning",
    rarity: "common",
  }),
  southReserve: makeCard({
    key: "south-reserve",
    name: "South Reserve",
    movementRule: adjacentRule,
    movementType: "adjacent",
    baseAttack: 1200,
    baseDefense: 1600,
    attribute: "earth",
    rarity: "common",
  }),
  northShade: makeCard({
    key: "north-shade-secret",
    name: "North Hidden Shade",
    movementRule: orthogonalLineRule,
    movementType: "orthogonal",
    baseAttack: 2100,
    baseDefense: 1300,
    attribute: "dark",
    rarity: "super_rare",
  }),
  northOracle: makeCard({
    key: "north-oracle",
    name: "North Revealed Oracle",
    movementRule: diagonalLineRule,
    movementType: "diagonal",
    baseAttack: 1600,
    baseDefense: 2100,
    attribute: "water",
    rarity: "rare",
  }),
  northReserve: makeCard({
    key: "north-reserve-secret",
    name: "North Reserve Secret",
    movementRule: adjacentRule,
    movementType: "adjacent",
    baseAttack: 1000,
    baseDefense: 1900,
    attribute: "neutral",
    rarity: "common",
  }),
};

export const localDebugMatchState: MatchState = {
  id: toMatchId("local-debug-match-task-7a"),
  gameMode: TACTICAL_DUEL_RULE_CONFIG.gameMode,
  rulesVersion: TACTICAL_DUEL_RULES_VERSION,
  boardSize: {
    width: TACTICAL_DUEL_RULE_CONFIG.boardWidth,
    height: TACTICAL_DUEL_RULE_CONFIG.boardHeight,
  },
  phase: "active",
  players: [
    {
      id: LOCAL_DEBUG_MATCH_PLAYER_IDS.north,
      playerId: toPlayerId("local-debug-account-north"),
      side: "north",
      reserveUnitIds: [toUnitId("local-debug-north-reserve")],
      setupSubmitted: true,
      flag: {
        ownerId: LOCAL_DEBUG_MATCH_PLAYER_IDS.north,
        damage: 2,
        maxDamage: TACTICAL_DUEL_RULE_CONFIG.flagMaxDamage,
      },
      connected: true,
    },
    {
      id: LOCAL_DEBUG_MATCH_PLAYER_IDS.south,
      playerId: toPlayerId("local-debug-account-south"),
      side: "south",
      reserveUnitIds: [toUnitId("local-debug-south-reserve")],
      setupSubmitted: true,
      flag: {
        ownerId: LOCAL_DEBUG_MATCH_PLAYER_IDS.south,
        damage: 1,
        maxDamage: TACTICAL_DUEL_RULE_CONFIG.flagMaxDamage,
      },
      connected: true,
    },
  ],
  units: [
    makeUnit({
      id: "north-hidden-shade",
      ownerId: LOCAL_DEBUG_MATCH_PLAYER_IDS.north,
      card: cards.northShade,
      row: 1,
      col: 2,
      stance: "attack",
      currentDefense: 1300,
    }),
    makeUnit({
      id: "north-revealed-oracle",
      ownerId: LOCAL_DEBUG_MATCH_PLAYER_IDS.north,
      card: cards.northOracle,
      row: 2,
      col: 5,
      stance: "defense",
      currentDefense: 1700,
    }),
    makeUnit({
      id: "north-reserve",
      ownerId: LOCAL_DEBUG_MATCH_PLAYER_IDS.north,
      card: cards.northReserve,
      row: null,
      col: null,
      status: "reserve",
      stance: "defense",
      currentDefense: 1900,
    }),
    makeUnit({
      id: "south-aegis",
      ownerId: LOCAL_DEBUG_MATCH_PLAYER_IDS.south,
      card: cards.southAegis,
      row: 6,
      col: 3,
      stance: "defense",
      currentDefense: 2100,
    }),
    makeUnit({
      id: "south-bolt",
      ownerId: LOCAL_DEBUG_MATCH_PLAYER_IDS.south,
      card: cards.southBolt,
      row: 5,
      col: 6,
      stance: "attack",
      currentDefense: 1500,
    }),
    makeUnit({
      id: "south-reserve",
      ownerId: LOCAL_DEBUG_MATCH_PLAYER_IDS.south,
      card: cards.southReserve,
      row: null,
      col: null,
      status: "reserve",
      stance: "defense",
      currentDefense: 1600,
    }),
  ],
  unitVisibilities: [
    {
      unitId: toUnitId("local-debug-north-revealed-oracle"),
      viewerId: LOCAL_DEBUG_MATCH_PLAYER_IDS.south,
      level: "revealed",
    },
    {
      unitId: toUnitId("local-debug-south-bolt"),
      viewerId: LOCAL_DEBUG_MATCH_PLAYER_IDS.north,
      level: "revealed",
    },
  ],
  currentTurnPlayerId: LOCAL_DEBUG_MATCH_PLAYER_IDS.south,
  turnNumber: 4,
  stateVersion: 12,
  winnerPlayerId: null,
  winReason: null,
};
