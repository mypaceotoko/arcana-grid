import type { BoardSize, Coordinate } from "./coordinates";
import type {
  CardAttribute,
  CardId,
  CardRarity,
  CharacterId,
  GameMode,
  MatchId,
  MatchPhase,
  MatchPlayerId,
  MovementType,
  PlayerId,
  PlayerSide,
  RulesVersion,
  Stance,
  UnitId,
  UnitStatus,
  WinReason,
} from "./types";

export type LineMovementRule = {
  kind: "line";
  directions: Coordinate[];
  maxDistance: number | null;
};

export type OffsetMovementRule = {
  kind: "offset";
  offsets: Coordinate[];
  canJump: boolean;
};

export type MovementRule = LineMovementRule | OffsetMovementRule;

export type CardSnapshot = {
  cardId: CardId;
  characterId: CharacterId;
  characterKey: string;
  cardKey: string;
  cardName: string;
  movementType: MovementType;
  movementRule: MovementRule;
  baseAttack: number;
  baseDefense: number;
  attribute: CardAttribute;
  rarity?: CardRarity;
  artworkUrl: string | null;
  abilityData: Record<string, unknown>;
};

export type UnitState = {
  id: UnitId;
  ownerId: MatchPlayerId;
  card: CardSnapshot;
  status: UnitStatus;
  position: Coordinate | null;
  stance: Stance;
  currentDefense: number;
};

export type VisibilityLevel = "owner_full" | "hidden" | "revealed";

export type UnitVisibility = {
  unitId: UnitId;
  viewerId: MatchPlayerId;
  level: VisibilityLevel;
};

export type FlagState = {
  ownerId: MatchPlayerId;
  damage: number;
  maxDamage: number;
};

export type MatchPlayerState = {
  id: MatchPlayerId;
  playerId: PlayerId;
  side: PlayerSide;
  reserveUnitIds: UnitId[];
  setupSubmitted: boolean;
  flag: FlagState;
  connected: boolean;
};

export type MatchState = {
  id: MatchId;
  gameMode: GameMode;
  rulesVersion: RulesVersion;
  boardSize: BoardSize;
  phase: MatchPhase;
  players: MatchPlayerState[];
  units: UnitState[];
  unitVisibilities: UnitVisibility[];
  currentTurnPlayerId: MatchPlayerId | null;
  turnNumber: number;
  stateVersion: number;
  winnerPlayerId: MatchPlayerId | null;
  winReason: WinReason | null;
};

export type HiddenUnitView = {
  revealed: false;
  unitId: UnitId;
  ownerId: MatchPlayerId;
  position: Coordinate | null;
  status: UnitStatus;
  cardBackKey: string;
};

export type RevealedUnitView = {
  revealed: true;
  unitId: UnitId;
  ownerId: MatchPlayerId;
  position: Coordinate | null;
  status: UnitStatus;
  stance: Stance;
  currentDefense: number;
  card: CardSnapshot;
};

export type UnitView = HiddenUnitView | RevealedUnitView;

export type PlayerMatchView = {
  matchId: MatchId;
  gameMode: GameMode;
  rulesVersion: RulesVersion;
  boardSize: BoardSize;
  phase: MatchPhase;
  viewerId: MatchPlayerId;
  players: MatchPlayerState[];
  units: UnitView[];
  currentTurnPlayerId: MatchPlayerId | null;
  turnNumber: number;
  stateVersion: number;
  winnerPlayerId: MatchPlayerId | null;
  winReason: WinReason | null;
};
