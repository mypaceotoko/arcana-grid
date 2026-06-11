import type { Coordinate } from "./coordinates";
import type {
  EventId,
  MatchId,
  MatchPlayerId,
  UnitId,
  WinReason,
} from "./types";

export type BaseGameEvent = {
  eventId: EventId;
  matchId: MatchId;
  stateVersion: number;
};

export type UnitMovedEvent = BaseGameEvent & {
  type: "UNIT_MOVED";
  unitId: UnitId;
  from: Coordinate | null;
  to: Coordinate;
};

export type RevealReason = "first_move" | "attacked";

export type UnitRevealedEvent = BaseGameEvent & {
  type: "UNIT_REVEALED";
  unitId: UnitId;
  viewerId: MatchPlayerId;
  reason: RevealReason;
};

export type CombatResolvedEvent = BaseGameEvent & {
  type: "COMBAT_RESOLVED";
  attackerUnitId: UnitId;
  defenderUnitId: UnitId;
};

export type UnitDefeatedEvent = BaseGameEvent & {
  type: "UNIT_DEFEATED";
  unitId: UnitId;
};

export type DefenseChangedEvent = BaseGameEvent & {
  type: "DEFENSE_CHANGED";
  unitId: UnitId;
  previousDefense: number;
  nextDefense: number;
};

export type FlagDamagedEvent = BaseGameEvent & {
  type: "FLAG_DAMAGED";
  ownerId: MatchPlayerId;
  previousDamage: number;
  nextDamage: number;
};

export type TurnChangedEvent = BaseGameEvent & {
  type: "TURN_CHANGED";
  previousPlayerId: MatchPlayerId | null;
  nextPlayerId: MatchPlayerId;
  turnNumber: number;
};

export type MatchFinishedEvent = BaseGameEvent & {
  type: "MATCH_FINISHED";
  winnerPlayerId: MatchPlayerId | null;
  winReason: WinReason;
};

export type GameEvent =
  | UnitMovedEvent
  | UnitRevealedEvent
  | CombatResolvedEvent
  | UnitDefeatedEvent
  | DefenseChangedEvent
  | FlagDamagedEvent
  | TurnChangedEvent
  | MatchFinishedEvent;

export type UnitMovedEventPayload = Omit<UnitMovedEvent, keyof BaseGameEvent>;
export type UnitRevealedEventPayload = Omit<
  UnitRevealedEvent,
  keyof BaseGameEvent
>;
export type CombatResolvedEventPayload = Omit<
  CombatResolvedEvent,
  keyof BaseGameEvent
>;
export type UnitDefeatedEventPayload = Omit<
  UnitDefeatedEvent,
  keyof BaseGameEvent
>;
export type DefenseChangedEventPayload = Omit<
  DefenseChangedEvent,
  keyof BaseGameEvent
>;
export type FlagDamagedEventPayload = Omit<FlagDamagedEvent, keyof BaseGameEvent>;
export type TurnChangedEventPayload = Omit<TurnChangedEvent, keyof BaseGameEvent>;
export type MatchFinishedEventPayload = Omit<
  MatchFinishedEvent,
  keyof BaseGameEvent
>;

export type GameEventPayload =
  | UnitMovedEventPayload
  | UnitRevealedEventPayload
  | CombatResolvedEventPayload
  | UnitDefeatedEventPayload
  | DefenseChangedEventPayload
  | FlagDamagedEventPayload
  | TurnChangedEventPayload
  | MatchFinishedEventPayload;
