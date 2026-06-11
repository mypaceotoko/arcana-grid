import type {
  BoardSize,
  Coordinate,
  GameEventPayload,
  MatchPlayerId,
  MatchPlayerState,
  PlayerSide,
  Stance,
  UnitState,
} from "../../core";
import type { TacticalRuleConfig } from "./types";

export type CanPlayerDeployReserveInput = {
  playerId: MatchPlayerId;
  units: readonly UnitState[];
  config: TacticalRuleConfig;
};

export type ReservePlayerInput =
  | {
      player: MatchPlayerState;
      playerId?: never;
      side?: never;
    }
  | {
      player?: never;
      playerId: MatchPlayerId;
      side: PlayerSide;
    };

export type GetReserveDeploymentCoordinatesInput = ReservePlayerInput & {
  units: readonly UnitState[];
  boardSize: BoardSize;
  config: TacticalRuleConfig;
};

export type ReserveDeploymentContext = ReservePlayerInput & {
  unit: UnitState;
  units: readonly UnitState[];
  destination: Coordinate;
  stance: Stance;
  boardSize: BoardSize;
  config: TacticalRuleConfig;
};

export type ReserveDeploymentResult = {
  unit: UnitState;
  destination: Coordinate;
  events: readonly GameEventPayload[];
};
