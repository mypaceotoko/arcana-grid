import { getFlagAreaCoordinates } from "@/game";
import type {
  Coordinate,
  GameEventPayload,
  MatchPlayerId,
  PlayerMatchView,
  Stance,
  UnitId,
  UnitView,
} from "@/game";

/**
 * Playback steps are derived only from reducer GameEvents plus the safe,
 * already-sanitized PlayerMatchViews held by the UI. They intentionally never
 * carry unrevealed card details (cardName, baseAttack, baseDefense, etc.).
 * Anything an opponent must not see stays out of these structures.
 */
export type PlaybackStepKind =
  | "reveal"
  | "move"
  | "combat"
  | "defense"
  | "defeat"
  | "advance"
  | "flag-attack"
  | "flag-damage"
  | "reserve-select"
  | "reserve-appear"
  | "turn"
  | "finish"
  | "concede";

export type RevealStep = {
  kind: "reveal";
  unitId: UnitId;
  ownerId: MatchPlayerId;
};

export type MoveStep = {
  kind: "move";
  unitId: UnitId;
  ownerId: MatchPlayerId;
  from: Coordinate;
  to: Coordinate;
  path: readonly Coordinate[];
  stance: Stance;
};

export type CombatStep = {
  kind: "combat";
  attackerUnitId: UnitId;
  defenderUnitId: UnitId;
  attackerCoord: Coordinate | null;
  defenderCoord: Coordinate | null;
  outcome: string;
  attackerMovedToDestination: boolean;
};

export type DefenseStep = {
  kind: "defense";
  unitId: UnitId;
  previousDefense: number;
  nextDefense: number;
};

export type DefeatStep = {
  kind: "defeat";
  unitId: UnitId;
};

export type AdvanceStep = {
  kind: "advance";
  unitId: UnitId;
  from: Coordinate;
  to: Coordinate;
  path: readonly Coordinate[];
  returned: boolean;
};

export type FlagAttackStep = {
  kind: "flag-attack";
  attackerUnitId: UnitId;
  attackerCoord: Coordinate | null;
  target: Coordinate;
  flagArea: readonly Coordinate[];
};

export type FlagDamageStep = {
  kind: "flag-damage";
  ownerId: MatchPlayerId;
  previousDamage: number;
  damage: number;
  maxDamage: number;
};

export type ReserveSelectStep = {
  kind: "reserve-select";
  unitId: UnitId;
  ownerId: MatchPlayerId;
};

export type ReserveAppearStep = {
  kind: "reserve-appear";
  unitId: UnitId;
  ownerId: MatchPlayerId;
  destination: Coordinate;
  stance: Stance;
};

export type TurnStep = {
  kind: "turn";
  previousPlayerId: MatchPlayerId | null;
  nextPlayerId: MatchPlayerId;
  turnNumber: number;
};

export type FinishStep = {
  kind: "finish";
  winnerPlayerId: MatchPlayerId;
  reason: string;
};

export type ConcedeStep = {
  kind: "concede";
  concedingPlayerId: MatchPlayerId;
};

export type PlaybackStep =
  | RevealStep
  | MoveStep
  | CombatStep
  | DefenseStep
  | DefeatStep
  | AdvanceStep
  | FlagAttackStep
  | FlagDamageStep
  | ReserveSelectStep
  | ReserveAppearStep
  | TurnStep
  | FinishStep
  | ConcedeStep;

const sign = (value: number): number => (value > 0 ? 1 : value < 0 ? -1 : 0);

/**
 * Returns the per-cell path a unit walks from `from` to `to`, excluding the
 * origin and including the destination. For orthogonal/diagonal line moves this
 * yields one coordinate per board cell traversed. For single-cell offset moves
 * it yields just the destination.
 */
export const buildMovePath = (
  from: Coordinate,
  to: Coordinate,
): Coordinate[] => {
  const path: Coordinate[] = [];
  let current = from;
  // Guard the loop so a non-linear delta can never spin forever.
  for (
    let guard = 0;
    guard < 64 && !(current.row === to.row && current.col === to.col);
    guard += 1
  ) {
    current = {
      row: current.row + sign(to.row - current.row),
      col: current.col + sign(to.col - current.col),
    };
    path.push(current);
  }
  return path;
};

const findUnit = (
  view: PlayerMatchView,
  unitId: UnitId,
): UnitView | undefined => view.units.find((unit) => unit.unitId === unitId);

const ownerOf = (
  preView: PlayerMatchView,
  postView: PlayerMatchView,
  unitId: UnitId,
): MatchPlayerId | undefined =>
  findUnit(preView, unitId)?.ownerId ?? findUnit(postView, unitId)?.ownerId;

const sideOfPlayer = (
  view: PlayerMatchView,
  playerId: MatchPlayerId,
): "north" | "south" | undefined =>
  view.players.find((player) => player.id === playerId)?.side;

export type BuildPlaybackInput = {
  events: readonly GameEventPayload[];
  preView: PlayerMatchView;
  postView: PlayerMatchView;
};

/**
 * Translates a single action's reducer events into an ordered list of playback
 * steps the UI can animate. The reducer result is never changed; this only
 * re-describes what already happened so a player can follow it beat by beat.
 */
export const buildPlaybackSteps = ({
  events,
  preView,
  postView,
}: BuildPlaybackInput): PlaybackStep[] => {
  const steps: PlaybackStep[] = [];
  let pendingAdvance: AdvanceStep | null = null;

  const flushAdvance = (): void => {
    if (pendingAdvance !== null) {
      steps.push(pendingAdvance);
      pendingAdvance = null;
    }
  };

  for (const event of events) {
    if (
      event.type === "TURN_CHANGED" ||
      event.type === "MATCH_FINISHED" ||
      event.type === "MATCH_CONCEDED"
    ) {
      flushAdvance();
    }

    switch (event.type) {
      case "UNIT_REVEALED": {
        const ownerId = ownerOf(preView, postView, event.unitId);
        if (ownerId !== undefined) {
          steps.push({ kind: "reveal", unitId: event.unitId, ownerId });
        }
        break;
      }
      case "UNIT_MOVED": {
        const from = event.from;
        const to = event.to;
        steps.push({
          kind: "move",
          unitId: event.unitId,
          ownerId: event.ownerId,
          from: from ?? to,
          to,
          path: from === null ? [to] : buildMovePath(from, to),
          stance: event.stance,
        });
        break;
      }
      case "COMBAT_RESOLVED": {
        const attacker = findUnit(preView, event.attackerUnitId);
        const defender = findUnit(preView, event.defenderUnitId);
        const attackerCoord = attacker?.position ?? null;
        const defenderCoord = defender?.position ?? null;
        steps.push({
          kind: "combat",
          attackerUnitId: event.attackerUnitId,
          defenderUnitId: event.defenderUnitId,
          attackerCoord,
          defenderCoord,
          outcome: event.outcome,
          attackerMovedToDestination: event.attackerMovedToDestination,
        });
        if (event.attackerStatusAfter !== "defeated" && attackerCoord !== null) {
          if (event.attackerMovedToDestination && defenderCoord !== null) {
            pendingAdvance = {
              kind: "advance",
              unitId: event.attackerUnitId,
              from: attackerCoord,
              to: defenderCoord,
              path: buildMovePath(attackerCoord, defenderCoord),
              returned: false,
            };
          } else {
            pendingAdvance = {
              kind: "advance",
              unitId: event.attackerUnitId,
              from: attackerCoord,
              to: attackerCoord,
              path: [],
              returned: true,
            };
          }
        }
        break;
      }
      case "DEFENSE_CHANGED": {
        steps.push({
          kind: "defense",
          unitId: event.unitId,
          previousDefense: event.previousDefense,
          nextDefense: event.nextDefense,
        });
        break;
      }
      case "UNIT_DEFEATED": {
        steps.push({ kind: "defeat", unitId: event.unitId });
        break;
      }
      case "FLAG_ATTACKED": {
        const attacker = findUnit(preView, event.attackerUnitId);
        const defenderSide = sideOfPlayer(postView, event.defenderPlayerId);
        const flagArea =
          defenderSide === undefined
            ? [event.target]
            : (() => {
                const result = getFlagAreaCoordinates({
                  side: defenderSide,
                  boardSize: postView.boardSize,
                });
                return result.ok ? [...result.value] : [event.target];
              })();
        steps.push({
          kind: "flag-attack",
          attackerUnitId: event.attackerUnitId,
          attackerCoord: attacker?.position ?? null,
          target: event.target,
          flagArea,
        });
        break;
      }
      case "FLAG_DAMAGED": {
        steps.push({
          kind: "flag-damage",
          ownerId: event.ownerId,
          previousDamage: event.previousDamage,
          damage: event.damage,
          maxDamage: event.maxDamage,
        });
        break;
      }
      case "RESERVE_DEPLOYED": {
        steps.push({
          kind: "reserve-select",
          unitId: event.unitId,
          ownerId: event.ownerId,
        });
        steps.push({
          kind: "reserve-appear",
          unitId: event.unitId,
          ownerId: event.ownerId,
          destination: event.destination,
          stance: event.stance,
        });
        break;
      }
      case "TURN_CHANGED": {
        steps.push({
          kind: "turn",
          previousPlayerId: event.previousPlayerId,
          nextPlayerId: event.nextPlayerId,
          turnNumber: event.turnNumber,
        });
        break;
      }
      case "MATCH_FINISHED": {
        steps.push({
          kind: "finish",
          winnerPlayerId: event.winnerPlayerId,
          reason: event.reason,
        });
        break;
      }
      case "MATCH_CONCEDED": {
        steps.push({
          kind: "concede",
          concedingPlayerId: event.concedingPlayerId,
        });
        break;
      }
      default:
        break;
    }
  }

  flushAdvance();
  return steps;
};
