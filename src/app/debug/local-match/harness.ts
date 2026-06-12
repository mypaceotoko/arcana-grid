import {
  TACTICAL_DUEL_RULE_CONFIG,
  applyTacticalDuelAction,
  buildPlayerMatchView,
  calculateLegalMoves,
  getFlagAreaCoordinates,
  getInitialPlacementCoordinates,
  getReserveDeploymentCoordinates,
  isCoordinateInFlagArea,
  coordinateKey,
  startTacticalDuelMatch,
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
  InitialPlacement,
} from "@/game";

import {
  LOCAL_DEBUG_CARD_BACK_KEY,
  LOCAL_DEBUG_MATCH_PLAYER_IDS,
  localDebugMatchState,
  localDebugSetupMatchState,
} from "./fixture";

export type LocalDebugMoveCandidate = {
  destination: Coordinate;
  kind: "move" | "engage";
};

export type LocalDebugReserveCandidate = {
  destination: Coordinate;
};

export type LocalDebugFlagAttackCandidate = {
  destination: Coordinate;
  kind: "flag_attack";
};

export type LocalDebugEventLogEntry = {
  index: number;
  type: GameEventPayload["type"];
  summary: string;
};

export type LocalDebugSetupInfo = {
  legalPlacementCoordinates: readonly Coordinate[];
};

export type LocalDebugViewResponse = {
  view: PlayerMatchView;
  events: readonly LocalDebugEventLogEntry[];
  stateStorageNote: string;
  setup: LocalDebugSetupInfo;
};

export type LocalDebugMoveCandidatesResponse = {
  unitId: UnitId;
  candidates: readonly LocalDebugMoveCandidate[];
};

export type LocalDebugReserveCandidatesResponse = {
  unitId: UnitId;
  candidates: readonly LocalDebugReserveCandidate[];
};

export type LocalDebugFlagAttackCandidatesResponse = {
  unitId: UnitId;
  candidates: readonly LocalDebugFlagAttackCandidate[];
};

export type LocalDebugMoveActionInput = {
  viewerSide: PlayerSide;
  unitId: UnitId;
  destination: Coordinate;
  nextStance: Stance;
  expectedStateVersion: number;
  actionId: ActionId;
};

export type LocalDebugDeployReserveActionInput = {
  viewerSide: PlayerSide;
  unitId: UnitId;
  destination: Coordinate;
  stance: Stance;
  expectedStateVersion: number;
  actionId: ActionId;
};

export type LocalDebugAttackFlagActionInput = {
  viewerSide: PlayerSide;
  unitId: UnitId;
  target: Coordinate;
  nextStance: Stance;
  expectedStateVersion: number;
  actionId: ActionId;
};

export type LocalDebugConcedeMatchActionInput = {
  viewerSide: PlayerSide;
  expectedStateVersion: number;
  actionId: ActionId;
};

export type LocalDebugSubmitInitialPlacementActionInput = {
  viewerSide: PlayerSide;
  placements: readonly InitialPlacement[];
  reserveUnitIds: readonly UnitId[];
  expectedStateVersion: number;
  actionId: ActionId;
};

type FirstPlayerRandomSource = () => number;

type LocalDebugHarnessStore = {
  state: MatchState;
  events: GameEventPayload[];
  firstPlayerRandomSource: FirstPlayerRandomSource;
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

const cloneSetupState = (): MatchState => cloneJson(localDebugSetupMatchState);
const cloneActiveState = (): MatchState => cloneJson(localDebugMatchState);
const defaultFirstPlayerRandomSource: FirstPlayerRandomSource = () => {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject !== undefined) {
    const values = new Uint32Array(1);
    cryptoObject.getRandomValues(values);
    return values[0] / 2 ** 32;
  }

  return Math.random();
};

const getGlobalStore = (): LocalDebugHarnessStore => {
  const globalObject = globalThis as typeof globalThis & {
    [STORE_KEY]?: LocalDebugHarnessStore;
  };

  globalObject[STORE_KEY] ??= {
    state: cloneSetupState(),
    events: [],
    firstPlayerRandomSource: defaultFirstPlayerRandomSource,
  };

  return globalObject[STORE_KEY];
};

const cloneCoordinate = (coordinate: Coordinate): Coordinate => ({
  row: coordinate.row,
  col: coordinate.col,
});

const getViewerId = (viewerSide: PlayerSide): MatchPlayerId =>
  LOCAL_DEBUG_MATCH_PLAYER_IDS[viewerSide] ?? toMatchPlayerId("");

const sanitizePlayerMatchView = (view: PlayerMatchView): PlayerMatchView => ({
  ...view,
  players: view.players.map((player) =>
    player.id === view.viewerId
      ? { ...player, reserveUnitIds: [...player.reserveUnitIds], flag: { ...player.flag } }
      : { ...player, reserveUnitIds: [], flag: { ...player.flag } },
  ),
  units: view.units
    .filter((unit) => unit.ownerId === view.viewerId || unit.revealed || view.phase !== "setup")
    .map((unit) => {
      if (unit.ownerId === view.viewerId || unit.revealed) {
        return unit.revealed
          ? { ...unit, position: unit.position === null ? null : cloneCoordinate(unit.position), card: { ...unit.card, abilityData: { ...unit.card.abilityData } } }
          : { ...unit, position: unit.position === null ? null : cloneCoordinate(unit.position) };
      }

      return {
        ...unit,
        position: unit.position === null ? null : cloneCoordinate(unit.position),
        status: view.phase === "setup" ? "reserve" : unit.status,
      };
    }),
});

const buildSafeView = (
  state: MatchState,
  viewerSide: PlayerSide,
): Result<PlayerMatchView, RuleError> => {
  const view = buildPlayerMatchView({
    state,
    viewerId: getViewerId(viewerSide),
    cardBackKey: LOCAL_DEBUG_CARD_BACK_KEY,
  });

  if (!view.ok) return view;
  return { ok: true, value: sanitizePlayerMatchView(view.value) };
};

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

const buildSetupInfo = (state: MatchState, viewerSide: PlayerSide): LocalDebugSetupInfo => {
  const viewerId = getViewerId(viewerSide);
  const player = state.players.find((candidate) => candidate.id === viewerId);
  if (player === undefined || state.phase !== "setup") {
    return { legalPlacementCoordinates: [] };
  }

  return {
    legalPlacementCoordinates: getInitialPlacementCoordinates(
      player.side,
      state.boardSize,
      TACTICAL_DUEL_RULE_CONFIG.initialPlacementDepth,
    ).filter((coordinate) => {
      const flagArea = isCoordinateInFlagArea({
        coordinate,
        side: player.side,
        boardSize: state.boardSize,
      });
      if (!flagArea.ok || flagArea.value) return false;
      return !state.units.some(
        (unit) =>
          unit.status === "board" &&
          unit.position !== null &&
          coordinateKey(unit.position) === coordinateKey(coordinate),
      );
    }),
  };
};

const assertActiveMatch = (state: MatchState): Result<true, RuleError> => {
  if (state.phase === "finished" || state.winnerPlayerId !== null || state.winReason !== null) {
    return {
      ok: false,
      error: makeRuleError("MATCH_FINISHED", "Finished matches cannot accept debug actions.", {
        phase: state.phase,
        winnerPlayerId: state.winnerPlayerId,
        winReason: state.winReason,
      }),
    };
  }

  if (state.phase !== "active") {
    return {
      ok: false,
      error: makeRuleError("INVALID_PHASE", "Debug actions require active phase.", {
        phase: state.phase,
      }),
    };
  }

  return { ok: true, value: true };
};

const assertViewerInAnyMatch = (
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

  return { ok: true, value: viewerId };
};

const assertViewerInMatch = (
  state: MatchState,
  viewerSide: PlayerSide,
): Result<MatchPlayerId, RuleError> => {
  const active = assertActiveMatch(state);
  if (!active.ok) return active;
  return assertViewerInAnyMatch(state, viewerSide);
};

const assertViewerCanAct = (
  state: MatchState,
  viewerSide: PlayerSide,
): Result<MatchPlayerId, RuleError> => {
  const viewer = assertViewerInMatch(state, viewerSide);

  if (!viewer.ok) return viewer;

  const viewerId = viewer.value;

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
      setup: buildSetupInfo(store.state, viewerSide),
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
      candidates: moves.value.flatMap((move) => {
        const flagArea = isAnyFlagCoordinate(store.state, move.destination);
        if (!flagArea.ok || flagArea.value) return [];
        return [{
          destination: cloneCoordinate(move.destination),
          kind: move.kind,
        }];
      }),
    },
  };
};


const isAnyFlagCoordinate = (
  state: MatchState,
  destination: Coordinate,
): Result<boolean, RuleError> => {
  for (const player of state.players) {
    const result = isCoordinateInFlagArea({
      coordinate: destination,
      side: player.side,
      boardSize: state.boardSize,
    });

    if (!result.ok) return result;
    if (result.value) return { ok: true, value: true };
  }

  return { ok: true, value: false };
};

const getOpponentPlayer = (state: MatchState, viewerId: MatchPlayerId) =>
  state.players.find((player) => player.id !== viewerId);

export const getLocalDebugReserveDeploymentCandidates = ({
  viewerSide,
  unitId,
}: {
  viewerSide: PlayerSide;
  unitId: UnitId;
}): Result<LocalDebugReserveCandidatesResponse, RuleError> => {
  const store = getGlobalStore();
  const actor = assertViewerCanAct(store.state, viewerSide);

  if (!actor.ok) return actor;

  const unit = store.state.units.find((candidate) => candidate.id === unitId);
  if (unit === undefined) {
    return { ok: false, error: makeRuleError("UNIT_NOT_FOUND", "Reserve unit was not found.", { unitId }) };
  }

  if (unit.ownerId !== actor.value) {
    return {
      ok: false,
      error: makeRuleError("UNIT_NOT_OWNED", "Viewer does not own the reserve unit.", {
        unitId,
        ownerId: unit.ownerId,
        viewerId: actor.value,
      }),
    };
  }

  if (unit.status !== "reserve" || unit.position !== null) {
    return {
      ok: false,
      error: makeRuleError("UNIT_NOT_IN_RESERVE", "Only reserve units can be deployed.", {
        unitId,
        status: unit.status,
      }),
    };
  }

  const player = store.state.players.find((candidate) => candidate.id === actor.value);
  if (player === undefined) {
    return { ok: false, error: makeRuleError("MATCH_PLAYER_NOT_FOUND", "Viewer player was not found.", { viewerId: actor.value }) };
  }

  const coordinates = getReserveDeploymentCoordinates({
    player,
    units: store.state.units,
    boardSize: store.state.boardSize,
    config: TACTICAL_DUEL_RULE_CONFIG,
  });

  if (!coordinates.ok) return coordinates;

  return {
    ok: true,
    value: {
      unitId,
      candidates: coordinates.value.map((destination) => ({
        destination: cloneCoordinate(destination),
      })),
    },
  };
};

export const getLocalDebugFlagAttackCandidates = ({
  viewerSide,
  unitId,
}: {
  viewerSide: PlayerSide;
  unitId: UnitId;
}): Result<LocalDebugFlagAttackCandidatesResponse, RuleError> => {
  const store = getGlobalStore();
  const actor = assertViewerCanAct(store.state, viewerSide);

  if (!actor.ok) return actor;

  const unit = assertMovableViewerUnit(store.state, actor.value, unitId);
  if (!unit.ok) return unit;

  const opponent = getOpponentPlayer(store.state, actor.value);
  if (opponent === undefined) {
    return { ok: false, error: makeRuleError("MATCH_PLAYER_NOT_FOUND", "Opponent player was not found.", { actorId: actor.value }) };
  }

  const flagCoordinates = getFlagAreaCoordinates({
    side: opponent.side,
    boardSize: store.state.boardSize,
  });
  if (!flagCoordinates.ok) return flagCoordinates;

  const moves = calculateLegalMoves({
    unit: unit.value,
    units: store.state.units,
    boardSize: store.state.boardSize,
    movementRule: unit.value.card.movementRule,
    config: TACTICAL_DUEL_RULE_CONFIG,
  });
  if (!moves.ok) return moves;

  const reachableMoveKeys = new Set(
    moves.value
      .filter((move) => move.kind === "move")
      .map((move) => coordinateKey(move.destination)),
  );

  return {
    ok: true,
    value: {
      unitId,
      candidates: flagCoordinates.value
        .filter((destination) => reachableMoveKeys.has(coordinateKey(destination)))
        .map((destination) => ({
          destination: cloneCoordinate(destination),
          kind: "flag_attack" as const,
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


export const submitLocalDebugDeployReserve = (
  input: LocalDebugDeployReserveActionInput,
): Result<LocalDebugViewResponse, RuleError> => {
  const store = getGlobalStore();
  const actor = assertViewerCanAct(store.state, input.viewerSide);

  if (!actor.ok) return actor;

  const result = applyTacticalDuelAction({
    state: store.state,
    config: TACTICAL_DUEL_RULE_CONFIG,
    action: {
      type: "DEPLOY_RESERVE",
      actionId: input.actionId,
      matchId: store.state.id,
      actorId: actor.value,
      unitId: input.unitId,
      destination: cloneCoordinate(input.destination),
      stance: input.stance,
      expectedStateVersion: input.expectedStateVersion,
    },
  });

  if (!result.ok) return result;

  store.state = result.value.state;
  store.events.push(...result.value.events);

  return getLocalDebugMatchView(input.viewerSide);
};

export const submitLocalDebugAttackFlag = (
  input: LocalDebugAttackFlagActionInput,
): Result<LocalDebugViewResponse, RuleError> => {
  const store = getGlobalStore();
  const actor = assertViewerCanAct(store.state, input.viewerSide);

  if (!actor.ok) return actor;

  const result = applyTacticalDuelAction({
    state: store.state,
    config: TACTICAL_DUEL_RULE_CONFIG,
    action: {
      type: "ATTACK_FLAG",
      actionId: input.actionId,
      matchId: store.state.id,
      actorId: actor.value,
      unitId: input.unitId,
      target: cloneCoordinate(input.target),
      nextStance: input.nextStance,
      expectedStateVersion: input.expectedStateVersion,
    },
  });

  if (!result.ok) return result;

  store.state = result.value.state;
  store.events.push(...result.value.events);

  return getLocalDebugMatchView(input.viewerSide);
};

export const submitLocalDebugConcedeMatch = (
  input: LocalDebugConcedeMatchActionInput,
): Result<LocalDebugViewResponse, RuleError> => {
  const store = getGlobalStore();
  const actor = assertViewerInMatch(store.state, input.viewerSide);

  if (!actor.ok) return actor;

  const result = applyTacticalDuelAction({
    state: store.state,
    config: TACTICAL_DUEL_RULE_CONFIG,
    action: {
      type: "CONCEDE_MATCH",
      actionId: input.actionId,
      matchId: store.state.id,
      actorId: actor.value,
      expectedStateVersion: input.expectedStateVersion,
    },
  });

  if (!result.ok) return result;

  store.state = result.value.state;
  store.events.push(...result.value.events);

  return getLocalDebugMatchView(input.viewerSide);
};


const chooseFirstPlayerIdForStart = (
  state: MatchState,
  randomSource: FirstPlayerRandomSource,
): Result<MatchPlayerId, RuleError> => {
  const readyPlayers = state.players.filter((player) => player.setupSubmitted);
  if (readyPlayers.length !== 2) {
    return {
      ok: false,
      error: makeRuleError("INITIAL_PLACEMENT_NOT_COMPLETE", "Both players must submit initial placement before match start.", {
        submittedPlayerIds: readyPlayers.map((player) => player.id),
      }),
    };
  }

  const orderedPlayers = [...readyPlayers].sort((left, right) => left.id.localeCompare(right.id));
  const randomValue = randomSource();
  const firstIndex = Number.isFinite(randomValue) && randomValue >= 0.5 ? 1 : 0;
  return { ok: true, value: orderedPlayers[firstIndex].id };
};

const startMatchIfBothPlayersSubmitted = (
  store: LocalDebugHarnessStore,
): Result<true, RuleError> => {
  if (store.state.phase !== "setup") return { ok: true, value: true };
  if (!store.state.players.every((player) => player.setupSubmitted)) {
    return { ok: true, value: true };
  }

  const firstPlayer = chooseFirstPlayerIdForStart(store.state, store.firstPlayerRandomSource);
  if (!firstPlayer.ok) return firstPlayer;

  const started = startTacticalDuelMatch({
    state: store.state,
    firstPlayerId: firstPlayer.value,
    expectedStateVersion: store.state.stateVersion,
    config: TACTICAL_DUEL_RULE_CONFIG,
  });
  if (!started.ok) return started;

  store.state = started.value.state;
  store.events.push(...started.value.events);
  return { ok: true, value: true };
};

export const submitLocalDebugInitialPlacement = (
  input: LocalDebugSubmitInitialPlacementActionInput,
): Result<LocalDebugViewResponse, RuleError> => {
  const store = getGlobalStore();
  const actor = assertViewerInAnyMatch(store.state, input.viewerSide);
  if (!actor.ok) return actor;

  const result = applyTacticalDuelAction({
    state: store.state,
    config: TACTICAL_DUEL_RULE_CONFIG,
    action: {
      type: "SUBMIT_INITIAL_PLACEMENT",
      actionId: input.actionId,
      matchId: store.state.id,
      actorId: actor.value,
      placements: input.placements.map((placement) => ({
        unitId: placement.unitId,
        position: cloneCoordinate(placement.position),
        stance: placement.stance,
      })),
      reserveUnitIds: [...input.reserveUnitIds],
      expectedStateVersion: input.expectedStateVersion,
    },
  });

  if (!result.ok) return result;

  store.state = result.value.state;
  store.events.push(...result.value.events);

  const startResult = startMatchIfBothPlayersSubmitted(store);
  if (!startResult.ok) return startResult;

  return getLocalDebugMatchView(input.viewerSide);
};

export const resetLocalDebugMatch = (
  viewerSide: PlayerSide,
  fixture: "setup" | "active" = "setup",
): Result<LocalDebugViewResponse, RuleError> => {
  const store = getGlobalStore();
  store.state = fixture === "active" ? cloneActiveState() : cloneSetupState();
  store.events = [];
  return getLocalDebugMatchView(viewerSide);
};

export const unsafeGetLocalDebugMatchStateForTests = (): MatchState =>
  cloneJson(getGlobalStore().state);

export const unsafeSetLocalDebugMatchStateForTests = (state: MatchState): void => {
  const store = getGlobalStore();
  store.state = cloneJson(state);
  store.events = [];
};

export const unsafeSetFirstPlayerRandomSourceForTests = (
  randomSource: FirstPlayerRandomSource,
): void => {
  getGlobalStore().firstPlayerRandomSource = randomSource;
};

export const toLocalDebugUnitId = (value: string): UnitId => toUnitId(value);
export const toLocalDebugActionId = (value: string): ActionId => toActionId(value);
