import type { Coordinate, GameEventPayload, UnitState } from "../../core";

export type CombatOutcome =
  | "attacker_survived_attack_clash"
  | "defender_survived_attack_clash"
  | "both_defeated"
  | "defense_held"
  | "defender_defeated";

export type DestinationOccupant = "attacker" | "defender" | "none";

export type CombatResult = {
  outcome: CombatOutcome;
  attacker: UnitState;
  defender: UnitState;
  attackerOrigin: Coordinate;
  destination: Coordinate;
  destinationOccupant: DestinationOccupant;
  events: readonly GameEventPayload[];
};
