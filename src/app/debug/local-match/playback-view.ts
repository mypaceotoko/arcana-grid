import type { Coordinate, PlayerMatchView, UnitId, UnitView } from "@/game";

import type { PlaybackStep } from "./playback";

export type PlaybackTone =
  | "reveal"
  | "move"
  | "combat"
  | "defense"
  | "defeat"
  | "advance"
  | "flag"
  | "reserve"
  | "turn"
  | "finish";

export type PlaybackFrame = {
  step: PlaybackStep;
  /** Cell a unit currently occupies while a move/advance hops cell by cell. */
  moving?: { unitId: UnitId; coordinate: Coordinate };
  tone: PlaybackTone;
  title: string;
  detail: string;
};

const compactId = (id: string): string => id.replace("local-debug-", "");

const coordLabel = (coordinate: Coordinate | null): string =>
  coordinate === null ? "—" : `r${coordinate.row}/c${coordinate.col}`;

/**
 * Expands the ordered playback steps into render frames. Move and advance steps
 * fan out into one frame per traversed cell so a piece visibly walks the board
 * instead of teleporting to its destination.
 */
export const buildPlaybackFrames = (
  steps: readonly PlaybackStep[],
): PlaybackFrame[] => {
  const frames: PlaybackFrame[] = [];

  for (const step of steps) {
    switch (step.kind) {
      case "reveal":
        frames.push({
          step,
          tone: "reveal",
          title: "カード公開",
          detail: `${compactId(step.unitId)} が相手へ公開されました`,
        });
        break;
      case "move": {
        const path = step.path.length > 0 ? step.path : [step.to];
        path.forEach((coordinate, index) => {
          frames.push({
            step,
            moving: { unitId: step.unitId, coordinate },
            tone: "move",
            title: index === path.length - 1 ? "移動完了" : "移動中",
            detail: `${compactId(step.unitId)} → ${coordLabel(coordinate)}`,
          });
        });
        break;
      }
      case "combat":
        frames.push({
          step,
          tone: "combat",
          title: "戦闘開始",
          detail: `${compactId(step.attackerUnitId)} と ${compactId(
            step.defenderUnitId,
          )} が交戦`,
        });
        break;
      case "defense":
        frames.push({
          step,
          tone: "defense",
          title: "防御値変化",
          detail: `${compactId(step.unitId)}: ${step.previousDefense} → ${step.nextDefense}`,
        });
        break;
      case "defeat":
        frames.push({
          step,
          tone: "defeat",
          title: "ユニット消滅",
          detail: `${compactId(step.unitId)} が消滅`,
        });
        break;
      case "advance": {
        if (step.path.length === 0) {
          frames.push({
            step,
            tone: "advance",
            title: step.returned ? "攻撃側は元の位置へ" : "攻撃側前進",
            detail: `${compactId(step.unitId)} ${coordLabel(step.to)}`,
          });
          break;
        }
        step.path.forEach((coordinate, index) => {
          frames.push({
            step,
            moving: { unitId: step.unitId, coordinate },
            tone: "advance",
            title: index === step.path.length - 1 ? "前進完了" : "前進中",
            detail: `${compactId(step.unitId)} → ${coordLabel(coordinate)}`,
          });
        });
        break;
      }
      case "flag-attack":
        frames.push({
          step,
          tone: "flag",
          title: "旗エリア攻撃",
          detail: `${compactId(step.attackerUnitId)} が中央旗エリアを攻撃`,
        });
        break;
      case "flag-damage":
        frames.push({
          step,
          tone: "flag",
          title: "旗ダメージ",
          detail: `${step.previousDamage} → ${step.damage} / ${step.maxDamage}`,
        });
        break;
      case "reserve-select":
        frames.push({
          step,
          tone: "reserve",
          title: "リザーバー選択",
          detail: `${compactId(step.unitId)} を投入`,
        });
        break;
      case "reserve-appear":
        frames.push({
          step,
          tone: "reserve",
          title: "盤面へ出現",
          detail: `${compactId(step.unitId)} → ${coordLabel(step.destination)} / ${step.stance}`,
        });
        break;
      case "turn":
        frames.push({
          step,
          tone: "turn",
          title: "ターン交代",
          detail: `手番 ${step.turnNumber} へ`,
        });
        break;
      case "finish":
        frames.push({
          step,
          tone: "finish",
          title: "決着",
          detail: `勝者 ${compactId(step.winnerPlayerId)} / ${step.reason}`,
        });
        break;
      case "concede":
        frames.push({
          step,
          tone: "finish",
          title: "投了",
          detail: `${compactId(step.concedingPlayerId)} が投了`,
        });
        break;
      default:
        break;
    }
  }

  return frames;
};

export type PlaybackHighlight = {
  tone: PlaybackTone;
  unitIds: readonly UnitId[];
  coordinates: readonly Coordinate[];
};

export type PlaybackBoard = {
  units: UnitView[];
  highlight: PlaybackHighlight | null;
};

const findUnit = (
  view: PlayerMatchView,
  unitId: UnitId,
): UnitView | undefined => view.units.find((unit) => unit.unitId === unitId);

type Slot = { view: UnitView; position: Coordinate | null };

/**
 * Reconstructs the board exactly as it should look at frame `index`, starting
 * from the pre-action view and replaying only the visual effects of each frame.
 * Reveals swap in the already-sanitized post-action view, so no hidden card
 * detail is ever surfaced before the reducer revealed it to this viewer.
 */
export const computePlaybackBoard = (
  preView: PlayerMatchView,
  postView: PlayerMatchView,
  frames: readonly PlaybackFrame[],
  index: number,
): PlaybackBoard => {
  const slots = new Map<UnitId, Slot>();
  for (const unit of preView.units) {
    slots.set(unit.unitId, { view: unit, position: unit.position });
  }

  const reveal = (unitId: UnitId): void => {
    const post = findUnit(postView, unitId);
    const current = slots.get(unitId);
    if (post !== undefined && current !== undefined) {
      slots.set(unitId, { view: post, position: current.position });
    }
  };

  const setPosition = (unitId: UnitId, position: Coordinate | null): void => {
    const current = slots.get(unitId);
    if (current !== undefined) {
      slots.set(unitId, { view: current.view, position });
    }
  };

  const overrideDefense = (unitId: UnitId, nextDefense: number): void => {
    const current = slots.get(unitId);
    if (current !== undefined && current.view.revealed) {
      slots.set(unitId, {
        view: { ...current.view, currentDefense: nextDefense },
        position: current.position,
      });
    }
  };

  const defeat = (unitId: UnitId): void => {
    const current = slots.get(unitId);
    if (current !== undefined) {
      slots.set(unitId, {
        view: { ...current.view, status: "defeated" },
        position: null,
      });
    }
  };

  const lastIndex = Math.min(index, frames.length - 1);
  for (let i = 0; i <= lastIndex; i += 1) {
    const frame = frames[i];
    const step = frame.step;
    switch (step.kind) {
      case "reveal":
        reveal(step.unitId);
        break;
      case "move":
      case "advance":
        if (frame.moving !== undefined) {
          setPosition(frame.moving.unitId, frame.moving.coordinate);
        }
        break;
      case "defense":
        overrideDefense(step.unitId, step.nextDefense);
        break;
      case "defeat":
        defeat(step.unitId);
        break;
      case "reserve-appear":
        reveal(step.unitId);
        setPosition(step.unitId, step.destination);
        break;
      default:
        break;
    }
  }

  const units = [...slots.values()].map(
    ({ view, position }) => ({ ...view, position }) as UnitView,
  );

  return { units, highlight: highlightForFrame(frames[lastIndex]) };
};

const highlightForFrame = (
  frame: PlaybackFrame | undefined,
): PlaybackHighlight | null => {
  if (frame === undefined) return null;
  const step = frame.step;

  switch (step.kind) {
    case "reveal":
      return { tone: "reveal", unitIds: [step.unitId], coordinates: [] };
    case "move":
    case "advance":
      return frame.moving === undefined
        ? { tone: frame.tone, unitIds: [step.unitId], coordinates: [] }
        : {
            tone: frame.tone,
            unitIds: [frame.moving.unitId],
            coordinates: [frame.moving.coordinate],
          };
    case "combat": {
      const coordinates = [step.attackerCoord, step.defenderCoord].filter(
        (coordinate): coordinate is Coordinate => coordinate !== null,
      );
      return {
        tone: "combat",
        unitIds: [step.attackerUnitId, step.defenderUnitId],
        coordinates,
      };
    }
    case "defense":
    case "defeat":
      return { tone: frame.tone, unitIds: [step.unitId], coordinates: [] };
    case "flag-attack":
      return {
        tone: "flag",
        unitIds: [step.attackerUnitId],
        coordinates: step.flagArea,
      };
    case "flag-damage":
      return { tone: "flag", unitIds: [], coordinates: [] };
    case "reserve-select":
      return { tone: "reserve", unitIds: [step.unitId], coordinates: [] };
    case "reserve-appear":
      return {
        tone: "reserve",
        unitIds: [step.unitId],
        coordinates: [step.destination],
      };
    case "turn":
      return { tone: "turn", unitIds: [], coordinates: [] };
    case "finish":
    case "concede":
      return { tone: "finish", unitIds: [], coordinates: [] };
    default:
      return null;
  }
};
