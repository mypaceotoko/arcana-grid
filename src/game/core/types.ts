export type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };

export type GameMode = "tactical_duel";
export type RulesVersion = Brand<string, "RulesVersion">;

export type MatchId = Brand<string, "MatchId">;
export type PlayerId = Brand<string, "PlayerId">;
export type MatchPlayerId = Brand<string, "MatchPlayerId">;
export type UnitId = Brand<string, "UnitId">;
export type CardId = Brand<string, "CardId">;
export type CharacterId = Brand<string, "CharacterId">;
export type ActionId = Brand<string, "ActionId">;
export type EventId = Brand<string, "EventId">;

// Sides use board orientation names so internal coordinates do not depend on UI mirroring.
export type PlayerSide = "north" | "south";
export type Stance = "attack" | "defense";
export type UnitStatus = "reserve" | "board" | "defeated";

export type MovementType =
  | "orthogonal"
  | "diagonal"
  | "adjacent"
  | "special_offset";

export const MOVEMENT_TYPES: readonly MovementType[] = [
  "orthogonal",
  "diagonal",
  "adjacent",
  "special_offset",
] as const;

export type CardAttribute =
  | "fire"
  | "water"
  | "lightning"
  | "earth"
  | "light"
  | "dark"
  | "neutral";

export type KnownCardRarity =
  | "common"
  | "rare"
  | "super_rare"
  | "legendary";
export type CardRarity = string;

export type MatchPhase =
  | "waiting"
  | "setup"
  | "active"
  | "finished"
  | "aborted";

export type WinReason =
  | "annihilation"
  | "flag_destroyed"
  | "concession"
  | "disconnect"
  | "aborted";
// "disconnect" is a provisional reason until disconnect-win rules are finalized.

export type Result<T, E> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: E;
    };

export const toRulesVersion = (value: string): RulesVersion =>
  value as RulesVersion;

export const toMatchId = (value: string): MatchId => value as MatchId;
export const toPlayerId = (value: string): PlayerId => value as PlayerId;
export const toMatchPlayerId = (value: string): MatchPlayerId =>
  value as MatchPlayerId;
export const toUnitId = (value: string): UnitId => value as UnitId;
export const toCardId = (value: string): CardId => value as CardId;
export const toCharacterId = (value: string): CharacterId =>
  value as CharacterId;
export const toActionId = (value: string): ActionId => value as ActionId;
export const toEventId = (value: string): EventId => value as EventId;
