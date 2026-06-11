import type {
  BoardSize,
  Coordinate,
  FlagState,
  GameEventPayload,
  MatchPlayerId,
  PlayerSide,
} from "../../core";

export type FlagArea = {
  ownerId: MatchPlayerId;
  side: PlayerSide;
  coordinates: readonly Coordinate[];
};

export type GetFlagAreaCoordinatesInput = {
  side: PlayerSide;
  boardSize: BoardSize;
};

export type IsCoordinateInFlagAreaInput = {
  coordinate: Coordinate;
  side: PlayerSide;
  boardSize: BoardSize;
};

export type ApplyFlagDamageInput = {
  flag: FlagState;
  amount?: number;
};

export type ApplyFlagDamageResult = {
  flag: FlagState;
  previousDamage: number;
  appliedDamage: number;
  reachedMaximum: boolean;
  events: readonly GameEventPayload[];
};
