import type { Coordinate } from "./coordinates";
import type {
  ActionId,
  MatchId,
  MatchPlayerId,
  Stance,
  UnitId,
} from "./types";

export type MoveUnitAction = {
  type: "MOVE_UNIT";
  actionId: ActionId;
  matchId: MatchId;
  actorId: MatchPlayerId;
  unitId: UnitId;
  destination: Coordinate;
  nextStance: Stance;
  expectedStateVersion: number;
};

export type DeployReserveAction = {
  type: "DEPLOY_RESERVE";
  actionId: ActionId;
  matchId: MatchId;
  actorId: MatchPlayerId;
  unitId: UnitId;
  destination: Coordinate;
  stance: Stance;
  expectedStateVersion: number;
};

export type InitialPlacement = {
  unitId: UnitId;
  position: Coordinate;
  stance: Stance;
};

export type SubmitInitialPlacementAction = {
  type: "SUBMIT_INITIAL_PLACEMENT";
  actionId: ActionId;
  matchId: MatchId;
  actorId: MatchPlayerId;
  placements: InitialPlacement[];
  expectedStateVersion: number;
};

export type ConcedeMatchAction = {
  type: "CONCEDE_MATCH";
  actionId: ActionId;
  matchId: MatchId;
  actorId: MatchPlayerId;
  expectedStateVersion: number;
};

export type GameAction =
  | MoveUnitAction
  | DeployReserveAction
  | SubmitInitialPlacementAction
  | ConcedeMatchAction;
