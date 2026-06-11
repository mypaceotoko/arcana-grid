import {
  TACTICAL_DUEL_RULE_CONFIG,
  applyTacticalDuelAction,
  buildPlayerMatchView,
  calculateLegalMoves,
  toActionId,
  toMatchPlayerId,
  toUnitId,
} from "@/game";
import type {
  ActionId,
  Coordinate,
  GameEventPayload,
  MatchPlayerId,
  MatchState,
  PlayerMatchView,
  PlayerSide,
  Result,
  RuleError,
  Stance,
  UnitId,
} from "@/game";

import {
  LOCAL_DEBUG_CARD_BACK_KEY,
  LOCAL_DEBUG_MATCH_PLAYER_IDS,
  localDebugMatchState,
} from "./fixture";

export type LocalDebugMoveCandidate = {
  destination: Coordinate;
  kind: "move" | "engage";
};

export type LocalDebugEventLogEntry = {
  index: number;
  type: GameEventPayload["type"];
  summary: string;
};

export type LocalDebugViewResponse = {
  view: PlayerMatchView;
  events: readonly LocalDebugEventLogEntry[];
  stateStorageNote: string;
};

export type LocalDebugMoveCandidatesResponse = {
  unitId: UnitId;
  candidates: readonly LocalDebugMoveCandidate[];
};

export type LocalDebugMoveActionInput = {
  viewerSide: PlayerSide;
  unitId: UnitId;
  destination: Coordinate;
  nextStance: Stance;
  expectedStateVersion: number;
  actionId: ActionId;
};

type LocalDebugHarnessStore = {
  state: MatchState;
  events: GameEventPayload[];
};

const STORE_KEY = "__arcanaGridLocalDebugMatchHarness__";

export const LOCAL_DEBUG_STATE_STORAGE_NOTE =
  "debug/local-match専用のインメモリ状態です。本番保存方式ではなく、開発サーバーの再起動でfixture初期状態へ戻ります。";

const makeRuleError = (
  code: RuleError["code"],
  message: string,
  details?: Record<string, unknown>,
): RuleError => ({ code, message, details });

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const cloneInitialState = (): MatchState => cloneJson(localDebugMatchState);

const getGlobalStore = (): LocalDebugHarnessStore => {
  const globalObject = globalThis as typeof globalThis & {
    [STORE_KEY]?: LocalDebugHarnessStore;
  };

  globalObject[STORE_KEY] ??= {
    state: cloneInitialState(),
    events: [],
  };

  return globalObject[STORE_KEY];
};

const cloneCoordinate = (coordinate: Coordinate): Coordinate => ({
  row: coordinate.row,
  col: coordinate.col,
});

const getViewerId = (viewerSide: PlayerSide): MatchPlayerId =>
  LOCAL_DEBUG_MATCH_PLAYER_IDS[viewerSide] ?? toMatchPlayerId("");

const buildSafeView = (
  state: MatchState,
  viewerSide: PlayerSide,
): Result<PlayerMatchView, RuleError> =>
  buildPlayerMatchView({
    state,
    viewerId: getViewerId(viewerSide),
    cardBackKey: LOCAL_DEBUG_CARD_BACK_KEY,
  });

const summarizeCoordinate = (coordinate: Coordinate | null | undefined): string =>
  coordinate === null || coordinate === undefined
    ? "—"
    : `r${coordinate.row}/c${coordinate.col}`;

const summarizeEvent = (event: GameEventPayload): string => {
  switch (event.type) {
    case "UNIT_MOVED":
      return `${event.unitId}: ${summarizeCoordinate(event.from)} → ${summarizeCoordinate(event.to)} / ${event.stance}`;
    case "UNIT_REVEALED":
      return `${event.unitId}: ${event.reason}で${event.viewerId}へ公開`;
    case "COMBAT_RESOLVED":
      return `${event.attackerUnitId} vs ${event.defenderUnitId}`;
    case "DEFENSE_CHANGED":
      return `${event.unitId}: ${event.previousDefense} → ${event.nextDefense}`;
    case "UNIT_DEFEATED":
      return `${event.unitId}が消滅`;
    case "TURN_CHANGED":
      return `${event.previousPlayerId ?? "—"} → ${event.nextPlayerId} / turn ${event.turnNumber}`;
    case "MATCH_FINISHED":
      return `${event.winnerPlayerId} wins by ${event.reason}`;
    case "FLAG_DAMAGED":
      return `${event.ownerId}: ${event.previousDamage} → ${event.damage}`;
    case "FLAG_ATTACKED":
      return `${event.attackerUnitId} attacks ${summarizeCoordinate(event.target)}`;
    case "RESERVE_DEPLOYED":
      return `${event.unitId} deployed to ${summarizeCoordinate(event.destination)}`;
    case "INITIAL_PLACEMENT_SUBMITTED":
      return `${event.playerId}: ${event.unitCount} units`;
    case "MATCH_CONCEDED":
      return `${event.concedingPlayerId} conceded`;
    case "MATCH_STARTED":
      return `${event.firstPlayerId} starts turn ${event.turnNumber}`;
  }
};

const buildEventLog = (
  events: readonly GameEventPayload[],
): readonly LocalDebugEventLogEntry[] =>
  events.slice(-8).map((event, offset, sliced) => ({
    index: events.length - sliced.length + offset + 1,
    type: event.type,
    summary: summarizeEvent(event),
  }));

const assertViewerCanAct = (
  state: MatchState,
  viewerSide: PlayerSide,
): Result<MatchPlayerId, RuleError> => {
  const viewerId = getViewerId(viewerSide);

  if (!state.players.some((player) => player.id === viewerId)) {
    return {
      ok: false,
      error: makeRuleError("VIEWER_NOT_IN_MATCH", "Viewer is not in match.", {
        viewerSide,
      }),
    };
  }

  if (state.currentTurnPlayerId !== viewerId) {
    return {
      ok: false,
      error: makeRuleError("NOT_YOUR_TURN", "Viewer is not the current turn player.", {
        viewerId,
        currentTurnPlayerId: state.currentTurnPlayerId,
      }),
    };
  }

  return { ok: true, value: viewerId };
};

const assertMovableViewerUnit = (
  state: MatchState,
  viewerId: MatchPlayerId,
  unitId: UnitId,
): Result<NonNullable<MatchState["units"][number]>, RuleError> => {
  const unit = state.units.find((candidate) => candidate.id === unitId);

  if (unit === undefined) {
    return {
      ok: false,
      error: makeRuleError("UNIT_NOT_FOUND", "Unit was not found.", { unitId }),
    };
  }

  if (unit.ownerId !== viewerId) {
    return {
      ok: false,
      error: makeRuleError("UNIT_NOT_OWNED", "Viewer does not own the unit.", {
        unitId,
        ownerId: unit.ownerId,
        viewerId,
      }),
    };
  }

  if (unit.status === "defeated") {
    return {
      ok: false,
      error: makeRuleError("UNIT_DEFEATED", "Defeated units cannot move.", {
        unitId,
      }),
    };
  }

  if (unit.status !== "board" || unit.position === null) {
    return {
      ok: false,
      error: makeRuleError("UNIT_NOT_ON_BOARD", "Only board units can move.", {
        unitId,
        status: unit.status,
      }),
    };
  }

  return { ok: true, value: unit };
};

export const getLocalDebugMatchView = (
  viewerSide: PlayerSide,
): Result<LocalDebugViewResponse, RuleError> => {
  const store = getGlobalStore();
  const view = buildSafeView(store.state, viewerSide);

  if (!view.ok) return view;

  return {
    ok: true,
    value: {
      view: view.value,
      events: buildEventLog(store.events),
      stateStorageNote: LOCAL_DEBUG_STATE_STORAGE_NOTE,
    },
  };
};

export const getLocalDebugMoveCandidates = ({
  viewerSide,
  unitId,
}: {
  viewerSide: PlayerSide;
  unitId: UnitId;
}): Result<LocalDebugMoveCandidatesResponse, RuleError> => {
  const store = getGlobalStore();
  const actor = assertViewerCanAct(store.state, viewerSide);

  if (!actor.ok) return actor;

  const unit = assertMovableViewerUnit(store.state, actor.value, unitId);

  if (!unit.ok) return unit;

  const moves = calculateLegalMoves({
    unit: unit.value,
    units: store.state.units,
    boardSize: store.state.boardSize,
    movementRule: unit.value.card.movementRule,
    config: TACTICAL_DUEL_RULE_CONFIG,
  });

  if (!moves.ok) return moves;

  return {
    ok: true,
    value: {
      unitId,
      candidates: moves.value.map((move) => ({
        destination: cloneCoordinate(move.destination),
        kind: move.kind,
      })),
    },
  };
};

export const submitLocalDebugMoveUnit = (
  input: LocalDebugMoveActionInput,
): Result<LocalDebugViewResponse, RuleError> => {
  const store = getGlobalStore();
  const actor = assertViewerCanAct(store.state, input.viewerSide);

  if (!actor.ok) return actor;

  const unit = assertMovableViewerUnit(store.state, actor.value, input.unitId);

  if (!unit.ok) return unit;

  const result = applyTacticalDuelAction({
    state: store.state,
    config: TACTICAL_DUEL_RULE_CONFIG,
    action: {
      type: "MOVE_UNIT",
      actionId: input.actionId,
      matchId: store.state.id,
      actorId: actor.value,
      unitId: input.unitId,
      destination: cloneCoordinate(input.destination),
      nextStance: input.nextStance,
      expectedStateVersion: input.expectedStateVersion,
    },
  });

  if (!result.ok) return result;

  store.state = result.value.state;
  store.events.push(...result.value.events);

  return getLocalDebugMatchView(input.viewerSide);
};

export const resetLocalDebugMatch = (
  viewerSide: PlayerSide,
): Result<LocalDebugViewResponse, RuleError> => {
  const store = getGlobalStore();
  store.state = cloneInitialState();
  store.events = [];
  return getLocalDebugMatchView(viewerSide);
};

export const unsafeGetLocalDebugMatchStateForTests = (): MatchState =>
  cloneJson(getGlobalStore().state);

export const toLocalDebugUnitId = (value: string): UnitId => toUnitId(value);
export const toLocalDebugActionId = (value: string): ActionId => toActionId(value);
