import {
  TACTICAL_DUEL_RULE_CONFIG,
  TACTICAL_DUEL_RULES_VERSION,
  applyTacticalDuelAction,
  buildPlayerMatchView,
  calculateLegalMoves,
  coordinateKey,
  getFlagAreaCoordinates,
  getInitialPlacementCoordinates,
  getReserveDeploymentCoordinates,
  isCoordinateInFlagArea,
  startTacticalDuelMatch,
} from "@/game";
import type {
  ActionId,
  Coordinate,
  GameEventPayload,
  InitialPlacement,
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
  localDebugSetupMatchState,
} from "./fixture";
import type {
  LocalDebugFlagAttackCandidate,
  LocalDebugMoveCandidate,
  LocalDebugReserveCandidate,
  LocalDebugViewResponse,
} from "./harness";

export const LOCAL_DEBUG_BROWSER_STORAGE_KEY = "arcana-grid.local-match.v1";
export const LOCAL_DEBUG_BROWSER_STORAGE_VERSION = 1;
export const LOCAL_DEBUG_BROWSER_STORAGE_NOTE =
  "ブラウザ内デバッグ保存です。正式オンライン保存ではありません。この端末・このブラウザだけに保存されます。";

type FirstPlayerRandomSource = () => number;

export type LocalDebugBrowserFlowState = {
  viewerSide: PlayerSide;
  handoffAcknowledged: boolean;
};

export type LocalDebugBrowserPersistedState = {
  version: typeof LOCAL_DEBUG_BROWSER_STORAGE_VERSION;
  state: MatchState;
  events: GameEventPayload[];
  flow: LocalDebugBrowserFlowState;
};

export type LocalDebugStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

type HarnessStore = {
  state: MatchState;
  events: GameEventPayload[];
  flow: LocalDebugBrowserFlowState;
  firstPlayerRandomSource: FirstPlayerRandomSource;
};

const makeRuleError = (
  code: RuleError["code"],
  message: string,
  details?: Record<string, unknown>,
): RuleError => ({ code, message, details });

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const cloneSetupState = (): MatchState => cloneJson(localDebugSetupMatchState);
const cloneActiveState = (): MatchState => cloneJson(localDebugMatchState);

const cloneCoordinate = (coordinate: Coordinate): Coordinate => ({
  row: coordinate.row,
  col: coordinate.col,
});

const defaultFirstPlayerRandomSource: FirstPlayerRandomSource = () => 0;

const getViewerId = (viewerSide: PlayerSide): MatchPlayerId =>
  LOCAL_DEBUG_MATCH_PLAYER_IDS[viewerSide];

const defaultFlow = (
  viewerSide: PlayerSide = "south",
): LocalDebugBrowserFlowState => ({
  viewerSide,
  handoffAcknowledged: false,
});

const getPlayerBySide = (state: MatchState, side: PlayerSide) =>
  state.players.find((player) => player.side === side);

const isPlayerSetupSubmitted = (state: MatchState, side: PlayerSide): boolean =>
  getPlayerBySide(state, side)?.setupSubmitted === true;

const getCurrentTurnSide = (state: MatchState): PlayerSide | null =>
  state.players.find((player) => player.id === state.currentTurnPlayerId)
    ?.side ?? null;

const repairFlowForState = (
  state: MatchState,
  flow: LocalDebugBrowserFlowState,
): LocalDebugBrowserFlowState => {
  if (state.phase !== "setup") {
    return {
      viewerSide: flow.viewerSide,
      handoffAcknowledged: true,
    };
  }

  const firstPlayerSubmitted = isPlayerSetupSubmitted(state, "south");
  const secondPlayerSubmitted = isPlayerSetupSubmitted(state, "north");

  if (!firstPlayerSubmitted) {
    return defaultFlow("south");
  }

  if (!secondPlayerSubmitted) {
    if (flow.viewerSide === "north" && flow.handoffAcknowledged) {
      return { viewerSide: "north", handoffAcknowledged: true };
    }

    return { viewerSide: "south", handoffAcknowledged: false };
  }

  return {
    viewerSide: flow.viewerSide,
    handoffAcknowledged: true,
  };
};

const initialStore = (viewerSide: PlayerSide = "south"): HarnessStore => ({
  state: cloneSetupState(),
  events: [],
  flow: defaultFlow(viewerSide),
  firstPlayerRandomSource: defaultFirstPlayerRandomSource,
});

const isPlayerSide = (value: unknown): value is PlayerSide =>
  value === "north" || value === "south";

const validateMatchState = (value: unknown): value is MatchState => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<MatchState>;
  return (
    candidate.gameMode === TACTICAL_DUEL_RULE_CONFIG.gameMode &&
    candidate.rulesVersion === TACTICAL_DUEL_RULES_VERSION &&
    (candidate.phase === "setup" ||
      candidate.phase === "active" ||
      candidate.phase === "finished") &&
    Number.isInteger(candidate.stateVersion) &&
    Array.isArray(candidate.players) &&
    candidate.players.length === 2 &&
    Array.isArray(candidate.units) &&
    typeof candidate.boardSize === "object" &&
    candidate.boardSize !== null
  );
};

const validatePersistedState = (
  value: unknown,
): LocalDebugBrowserPersistedState | null => {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<LocalDebugBrowserPersistedState>;
  if (candidate.version !== LOCAL_DEBUG_BROWSER_STORAGE_VERSION) return null;
  if (!validateMatchState(candidate.state)) return null;
  if (!Array.isArray(candidate.events)) return null;
  if (typeof candidate.flow !== "object" || candidate.flow === null)
    return null;
  if (!isPlayerSide(candidate.flow.viewerSide)) return null;

  return {
    version: LOCAL_DEBUG_BROWSER_STORAGE_VERSION,
    state: candidate.state,
    events: candidate.events as GameEventPayload[],
    flow: {
      viewerSide: candidate.flow.viewerSide,
      handoffAcknowledged: candidate.flow.handoffAcknowledged === true,
    },
  };
};

const sanitizePlayerMatchView = (view: PlayerMatchView): PlayerMatchView => {
  const viewerPlayer = view.players.find(
    (player) => player.id === view.viewerId,
  );
  const hideSubmittedSetupDetails =
    view.phase === "setup" && viewerPlayer?.setupSubmitted === true;

  return {
    ...view,
    players: view.players.map((player) => {
      const hideReserveIds =
        player.id !== view.viewerId ||
        (hideSubmittedSetupDetails && player.id === view.viewerId);
      return {
        ...player,
        reserveUnitIds: hideReserveIds ? [] : [...player.reserveUnitIds],
        flag: { ...player.flag },
      };
    }),
    units: view.units
      .filter((unit) => {
        if (hideSubmittedSetupDetails && unit.ownerId === view.viewerId)
          return false;
        return (
          unit.ownerId === view.viewerId ||
          unit.revealed ||
          view.phase !== "setup"
        );
      })
      .map((unit) => {
        if (unit.ownerId === view.viewerId || unit.revealed) {
          return unit.revealed
            ? {
                ...unit,
                position:
                  unit.position === null
                    ? null
                    : cloneCoordinate(unit.position),
                card: {
                  ...unit.card,
                  abilityData: { ...unit.card.abilityData },
                },
              }
            : {
                ...unit,
                position:
                  unit.position === null
                    ? null
                    : cloneCoordinate(unit.position),
              };
        }

        return {
          ...unit,
          position:
            unit.position === null ? null : cloneCoordinate(unit.position),
          status: view.phase === "setup" ? "reserve" : unit.status,
        };
      }),
  };
};

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

const summarizeCoordinate = (
  coordinate: Coordinate | null | undefined,
): string =>
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
      return [
        `${event.attackerUnitId}(${event.attackerStance} ATK${event.attackerAttack} DEF${event.attackerDefenseBefore}→${event.attackerDefenseAfter})`,
        "vs",
        `${event.defenderUnitId}(${event.defenderStance} ATK${event.defenderAttack} DEF${event.defenderDefenseBefore}→${event.defenderDefenseAfter})`,
        `/ ${event.outcome}`,
        `/ ${event.attackerMovedToDestination ? "攻撃側が移動" : "攻撃側は元位置"}`,
      ].join(" ");
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

const buildEventLog = (events: readonly GameEventPayload[]) =>
  events.slice(-8).map((event, offset, sliced) => ({
    index: events.length - sliced.length + offset + 1,
    type: event.type,
    summary: summarizeEvent(event),
  }));

const buildSetupInfo = (state: MatchState, viewerSide: PlayerSide) => {
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
  if (
    state.phase === "finished" ||
    state.winnerPlayerId !== null ||
    state.winReason !== null
  ) {
    return {
      ok: false,
      error: makeRuleError(
        "MATCH_FINISHED",
        "Finished matches cannot accept debug actions.",
        {
          phase: state.phase,
          winnerPlayerId: state.winnerPlayerId,
          winReason: state.winReason,
        },
      ),
    };
  }

  if (state.phase !== "active") {
    return {
      ok: false,
      error: makeRuleError(
        "INVALID_PHASE",
        "Debug actions require active phase.",
        { phase: state.phase },
      ),
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

const assertViewerInMatch = (state: MatchState, viewerSide: PlayerSide) => {
  const active = assertActiveMatch(state);
  if (!active.ok) return active;
  return assertViewerInAnyMatch(state, viewerSide);
};

const assertViewerCanAct = (state: MatchState, viewerSide: PlayerSide) => {
  const viewer = assertViewerInMatch(state, viewerSide);
  if (!viewer.ok) return viewer;

  if (state.currentTurnPlayerId !== viewer.value) {
    return {
      ok: false as const,
      error: makeRuleError(
        "NOT_YOUR_TURN",
        "Viewer is not the current turn player.",
        {
          viewerId: viewer.value,
          currentTurnPlayerId: state.currentTurnPlayerId,
        },
      ),
    };
  }

  return viewer;
};

const assertMovableViewerUnit = (
  state: MatchState,
  viewerId: MatchPlayerId,
  unitId: UnitId,
) => {
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (unit === undefined) {
    return {
      ok: false as const,
      error: makeRuleError("UNIT_NOT_FOUND", "Unit was not found.", { unitId }),
    };
  }
  if (unit.ownerId !== viewerId) {
    return {
      ok: false as const,
      error: makeRuleError("UNIT_NOT_OWNED", "Viewer does not own the unit.", {
        unitId,
        ownerId: unit.ownerId,
        viewerId,
      }),
    };
  }
  if (unit.status === "defeated") {
    return {
      ok: false as const,
      error: makeRuleError("UNIT_DEFEATED", "Defeated units cannot move.", {
        unitId,
      }),
    };
  }
  if (unit.status !== "board" || unit.position === null) {
    return {
      ok: false as const,
      error: makeRuleError("UNIT_NOT_ON_BOARD", "Only board units can move.", {
        unitId,
        status: unit.status,
      }),
    };
  }
  return { ok: true as const, value: unit };
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

const chooseFirstPlayerIdForStart = (
  state: MatchState,
  randomSource: FirstPlayerRandomSource,
): Result<MatchPlayerId, RuleError> => {
  const readyPlayers = state.players.filter((player) => player.setupSubmitted);
  if (readyPlayers.length !== 2) {
    return {
      ok: false,
      error: makeRuleError(
        "INITIAL_PLACEMENT_NOT_COMPLETE",
        "Both players must submit initial placement before match start.",
        { submittedPlayerIds: readyPlayers.map((player) => player.id) },
      ),
    };
  }
  const orderedPlayers = [...readyPlayers].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const randomValue = randomSource();
  const firstIndex = Number.isFinite(randomValue) && randomValue >= 0.5 ? 1 : 0;
  return { ok: true, value: orderedPlayers[firstIndex].id };
};

export class LocalDebugBrowserHarness {
  private store: HarnessStore;

  constructor(
    private readonly storage: LocalDebugStorage,
    private readonly key = LOCAL_DEBUG_BROWSER_STORAGE_KEY,
    viewerSide: PlayerSide = "south",
  ) {
    this.store = this.loadStore(viewerSide);
  }

  get persistedStateForTests(): LocalDebugBrowserPersistedState {
    return cloneJson(this.toPersistedState());
  }

  get flow(): LocalDebugBrowserFlowState {
    return { ...this.store.flow };
  }

  setFirstPlayerRandomSourceForTests(
    randomSource: FirstPlayerRandomSource,
  ): void {
    this.store.firstPlayerRandomSource = randomSource;
  }

  getView(
    viewerSide = this.store.flow.viewerSide,
  ): Result<LocalDebugViewResponse, RuleError> {
    const requestedFlow = repairFlowForState(this.store.state, {
      viewerSide,
      handoffAcknowledged:
        viewerSide === "north" ? true : this.store.flow.handoffAcknowledged,
    });
    this.store.flow = requestedFlow;
    this.persist();
    return this.buildView(this.store.flow.viewerSide);
  }

  getMoveCandidates({
    viewerSide,
    unitId,
  }: {
    viewerSide: PlayerSide;
    unitId: UnitId;
  }): Result<
    { unitId: UnitId; candidates: readonly LocalDebugMoveCandidate[] },
    RuleError
  > {
    const actor = assertViewerCanAct(this.store.state, viewerSide);
    if (!actor.ok) return actor;
    const unit = assertMovableViewerUnit(this.store.state, actor.value, unitId);
    if (!unit.ok) return unit;
    const moves = calculateLegalMoves({
      unit: unit.value,
      units: this.store.state.units,
      boardSize: this.store.state.boardSize,
      movementRule: unit.value.card.movementRule,
      config: TACTICAL_DUEL_RULE_CONFIG,
    });
    if (!moves.ok) return moves;
    return {
      ok: true,
      value: {
        unitId,
        candidates: moves.value.flatMap((move) => {
          const flagArea = isAnyFlagCoordinate(
            this.store.state,
            move.destination,
          );
          if (!flagArea.ok || flagArea.value) return [];
          return [
            { destination: cloneCoordinate(move.destination), kind: move.kind },
          ];
        }),
      },
    };
  }

  getReserveDeploymentCandidates({
    viewerSide,
    unitId,
  }: {
    viewerSide: PlayerSide;
    unitId: UnitId;
  }): Result<
    { unitId: UnitId; candidates: readonly LocalDebugReserveCandidate[] },
    RuleError
  > {
    const actor = assertViewerCanAct(this.store.state, viewerSide);
    if (!actor.ok) return actor;
    const unit = this.store.state.units.find(
      (candidate) => candidate.id === unitId,
    );
    if (unit === undefined)
      return {
        ok: false,
        error: makeRuleError("UNIT_NOT_FOUND", "Reserve unit was not found.", {
          unitId,
        }),
      };
    if (unit.ownerId !== actor.value)
      return {
        ok: false,
        error: makeRuleError(
          "UNIT_NOT_OWNED",
          "Viewer does not own the reserve unit.",
          { unitId, ownerId: unit.ownerId, viewerId: actor.value },
        ),
      };
    if (unit.status !== "reserve" || unit.position !== null)
      return {
        ok: false,
        error: makeRuleError(
          "UNIT_NOT_IN_RESERVE",
          "Only reserve units can be deployed.",
          { unitId, status: unit.status },
        ),
      };
    const player = this.store.state.players.find(
      (candidate) => candidate.id === actor.value,
    );
    if (player === undefined)
      return {
        ok: false,
        error: makeRuleError(
          "MATCH_PLAYER_NOT_FOUND",
          "Viewer player was not found.",
          { viewerId: actor.value },
        ),
      };
    const coordinates = getReserveDeploymentCoordinates({
      player,
      units: this.store.state.units,
      boardSize: this.store.state.boardSize,
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
  }

  getFlagAttackCandidates({
    viewerSide,
    unitId,
  }: {
    viewerSide: PlayerSide;
    unitId: UnitId;
  }): Result<
    { unitId: UnitId; candidates: readonly LocalDebugFlagAttackCandidate[] },
    RuleError
  > {
    const actor = assertViewerCanAct(this.store.state, viewerSide);
    if (!actor.ok) return actor;
    const unit = assertMovableViewerUnit(this.store.state, actor.value, unitId);
    if (!unit.ok) return unit;
    const opponent = getOpponentPlayer(this.store.state, actor.value);
    if (opponent === undefined)
      return {
        ok: false,
        error: makeRuleError(
          "MATCH_PLAYER_NOT_FOUND",
          "Opponent player was not found.",
          { actorId: actor.value },
        ),
      };
    const flagCoordinates = getFlagAreaCoordinates({
      side: opponent.side,
      boardSize: this.store.state.boardSize,
    });
    if (!flagCoordinates.ok) return flagCoordinates;
    const moves = calculateLegalMoves({
      unit: unit.value,
      units: this.store.state.units,
      boardSize: this.store.state.boardSize,
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
          .filter((destination) =>
            reachableMoveKeys.has(coordinateKey(destination)),
          )
          .map((destination) => ({
            destination: cloneCoordinate(destination),
            kind: "flag_attack" as const,
          })),
      },
    };
  }

  submitInitialPlacement(input: {
    viewerSide: PlayerSide;
    placements: readonly InitialPlacement[];
    reserveUnitIds: readonly UnitId[];
    expectedStateVersion: number;
    actionId: ActionId;
  }): Result<LocalDebugViewResponse, RuleError> {
    const actor = assertViewerInAnyMatch(this.store.state, input.viewerSide);
    if (!actor.ok) return actor;
    if (
      this.store.state.phase === "setup" &&
      input.viewerSide === "north" &&
      !isPlayerSetupSubmitted(this.store.state, "south")
    ) {
      return {
        ok: false,
        error: makeRuleError(
          "INVALID_ACTION",
          "プレイヤー1の配置確定が正しく保存されていません。完全初期化してやり直してください。",
          {
            originalMessage:
              "Player 1 must submit initial placement before Player 2 starts setup.",
            requiredSide: "south",
            requestedSide: input.viewerSide,
          },
        ),
      };
    }

    const result = applyTacticalDuelAction({
      state: this.store.state,
      config: TACTICAL_DUEL_RULE_CONFIG,
      action: {
        type: "SUBMIT_INITIAL_PLACEMENT",
        actionId: input.actionId,
        matchId: this.store.state.id,
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

    const nextStore: HarnessStore = {
      state: result.value.state,
      events: [...this.store.events, ...result.value.events],
      flow: this.store.flow,
      firstPlayerRandomSource: this.store.firstPlayerRandomSource,
    };

    if (
      input.viewerSide === "south" &&
      !isPlayerSetupSubmitted(nextStore.state, "south")
    ) {
      return {
        ok: false,
        error: makeRuleError(
          "INVALID_ACTION",
          "プレイヤー1の配置確定が正しく保存されていません。完全初期化してやり直してください。",
          {
            originalMessage:
              "SUBMIT_INITIAL_PLACEMENT did not mark Player 1 as submitted.",
            requiredSide: "south",
            requestedSide: input.viewerSide,
          },
        ),
      };
    }

    const startResult = this.startMatchIfBothPlayersSubmitted(nextStore);
    if (!startResult.ok) return startResult;

    nextStore.flow = repairFlowForState(nextStore.state, {
      viewerSide: input.viewerSide,
      handoffAcknowledged: input.viewerSide === "north",
    });

    this.store = nextStore;
    this.persist();
    return this.buildView(this.store.flow.viewerSide);
  }

  submitMoveUnit(input: {
    viewerSide: PlayerSide;
    unitId: UnitId;
    destination: Coordinate;
    nextStance: Stance;
    expectedStateVersion: number;
    actionId: ActionId;
  }): Result<LocalDebugViewResponse, RuleError> {
    const actor = assertViewerCanAct(this.store.state, input.viewerSide);
    if (!actor.ok) return actor;
    const unit = assertMovableViewerUnit(
      this.store.state,
      actor.value,
      input.unitId,
    );
    if (!unit.ok) return unit;
    return this.applyAction(input.viewerSide, {
      type: "MOVE_UNIT",
      actionId: input.actionId,
      matchId: this.store.state.id,
      actorId: actor.value,
      unitId: input.unitId,
      destination: cloneCoordinate(input.destination),
      nextStance: input.nextStance,
      expectedStateVersion: input.expectedStateVersion,
    });
  }

  submitDeployReserve(input: {
    viewerSide: PlayerSide;
    unitId: UnitId;
    destination: Coordinate;
    stance: Stance;
    expectedStateVersion: number;
    actionId: ActionId;
  }): Result<LocalDebugViewResponse, RuleError> {
    const actor = assertViewerCanAct(this.store.state, input.viewerSide);
    if (!actor.ok) return actor;
    const unit = this.store.state.units.find(
      (candidate) => candidate.id === input.unitId,
    );
    if (unit === undefined) {
      return {
        ok: false,
        error: makeRuleError("UNIT_NOT_FOUND", "Reserve unit was not found.", {
          unitId: input.unitId,
        }),
      };
    }
    if (unit.ownerId !== actor.value) {
      return {
        ok: false,
        error: makeRuleError(
          "UNIT_NOT_OWNED",
          "Viewer does not own the reserve unit.",
          { unitId: input.unitId, ownerId: unit.ownerId, viewerId: actor.value },
        ),
      };
    }
    if (unit.status !== "reserve" || unit.position !== null) {
      return {
        ok: false,
        error: makeRuleError(
          "UNIT_NOT_IN_RESERVE",
          "Only reserve units can be deployed.",
          { unitId: input.unitId, status: unit.status },
        ),
      };
    }
    return this.applyAction(input.viewerSide, {
      type: "DEPLOY_RESERVE",
      actionId: input.actionId,
      matchId: this.store.state.id,
      actorId: actor.value,
      unitId: input.unitId,
      destination: cloneCoordinate(input.destination),
      stance: input.stance,
      expectedStateVersion: input.expectedStateVersion,
    });
  }

  submitAttackFlag(input: {
    viewerSide: PlayerSide;
    unitId: UnitId;
    target: Coordinate;
    nextStance: Stance;
    expectedStateVersion: number;
    actionId: ActionId;
  }): Result<LocalDebugViewResponse, RuleError> {
    const actor = assertViewerCanAct(this.store.state, input.viewerSide);
    if (!actor.ok) return actor;
    return this.applyAction(input.viewerSide, {
      type: "ATTACK_FLAG",
      actionId: input.actionId,
      matchId: this.store.state.id,
      actorId: actor.value,
      unitId: input.unitId,
      target: cloneCoordinate(input.target),
      nextStance: input.nextStance,
      expectedStateVersion: input.expectedStateVersion,
    });
  }

  submitConcedeMatch(input: {
    viewerSide: PlayerSide;
    expectedStateVersion: number;
    actionId: ActionId;
  }): Result<LocalDebugViewResponse, RuleError> {
    const actor = assertViewerInMatch(this.store.state, input.viewerSide);
    if (!actor.ok) return actor;
    return this.applyAction(input.viewerSide, {
      type: "CONCEDE_MATCH",
      actionId: input.actionId,
      matchId: this.store.state.id,
      actorId: actor.value,
      expectedStateVersion: input.expectedStateVersion,
    });
  }

  reset(
    viewerSide: PlayerSide,
    fixture: "setup" | "active" = "setup",
  ): Result<LocalDebugViewResponse, RuleError> {
    this.store.state =
      fixture === "active" ? cloneActiveState() : cloneSetupState();
    this.store.events = [];
    this.store.flow = defaultFlow(viewerSide);
    if (fixture === "active") this.store.flow.handoffAcknowledged = true;
    this.persist();
    return this.buildView(viewerSide);
  }

  clear(
    viewerSide: PlayerSide = "south",
  ): Result<LocalDebugViewResponse, RuleError> {
    this.storage.removeItem(this.key);
    this.store = initialStore(viewerSide);
    this.persist();
    return this.buildView(viewerSide);
  }

  private applyAction(
    viewerSide: PlayerSide,
    action: Parameters<typeof applyTacticalDuelAction>[0]["action"],
  ): Result<LocalDebugViewResponse, RuleError> {
    const result = applyTacticalDuelAction({
      state: this.store.state,
      config: TACTICAL_DUEL_RULE_CONFIG,
      action,
    });
    if (!result.ok) return result;
    this.commitResult(result.value.state, result.value.events);
    this.store.flow = repairFlowForState(this.store.state, {
      viewerSide: getCurrentTurnSide(this.store.state) ?? viewerSide,
      handoffAcknowledged: this.store.flow.handoffAcknowledged,
    });
    this.persist();
    return this.buildView(this.store.flow.viewerSide);
  }

  private commitResult(
    state: MatchState,
    events: readonly GameEventPayload[],
  ): void {
    this.store.state = state;
    this.store.events.push(...events);
  }

  private startMatchIfBothPlayersSubmitted(
    store: HarnessStore = this.store,
  ): Result<true, RuleError> {
    if (store.state.phase !== "setup") return { ok: true, value: true };
    if (!store.state.players.every((player) => player.setupSubmitted))
      return { ok: true, value: true };
    const firstPlayer = chooseFirstPlayerIdForStart(
      store.state,
      store.firstPlayerRandomSource,
    );
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
  }

  private buildView(
    viewerSide: PlayerSide,
  ): Result<LocalDebugViewResponse, RuleError> {
    const view = buildSafeView(this.store.state, viewerSide);
    if (!view.ok) return view;
    return {
      ok: true,
      value: {
        view: view.value,
        events: buildEventLog(this.store.events),
        stateStorageNote: LOCAL_DEBUG_BROWSER_STORAGE_NOTE,
        setup: buildSetupInfo(this.store.state, viewerSide),
      },
    };
  }

  private loadStore(viewerSide: PlayerSide): HarnessStore {
    const raw = this.storage.getItem(this.key);
    if (raw === null) {
      const store = initialStore(viewerSide);
      this.store = store;
      this.persist();
      return store;
    }

    try {
      const parsed = validatePersistedState(JSON.parse(raw));
      if (parsed === null)
        throw new Error("Invalid local debug persisted state.");
      const store: HarnessStore = {
        state: parsed.state,
        events: parsed.events,
        flow: repairFlowForState(parsed.state, parsed.flow),
        firstPlayerRandomSource: defaultFirstPlayerRandomSource,
      };
      const startResult = this.startMatchIfBothPlayersSubmitted(store);
      if (!startResult.ok) throw new Error(startResult.error.message);
      store.flow = repairFlowForState(store.state, store.flow);
      const validationView = buildSafeView(store.state, store.flow.viewerSide);
      if (!validationView.ok) throw new Error(validationView.error.message);
      if (
        JSON.stringify(store.flow) !== JSON.stringify(parsed.flow) ||
        store.state.phase !== parsed.state.phase ||
        store.state.stateVersion !== parsed.state.stateVersion
      ) {
        this.store = store;
        this.persist();
      }
      return store;
    } catch {
      const store = initialStore(viewerSide);
      this.store = store;
      this.persist();
      return store;
    }
  }

  private toPersistedState(): LocalDebugBrowserPersistedState {
    return {
      version: LOCAL_DEBUG_BROWSER_STORAGE_VERSION,
      state: this.store.state,
      events: this.store.events,
      flow: this.store.flow,
    };
  }

  private persist(): void {
    this.storage.setItem(this.key, JSON.stringify(this.toPersistedState()));
  }
}

export const createLocalDebugBrowserHarness = (
  storage: LocalDebugStorage,
  viewerSide: PlayerSide = "south",
): LocalDebugBrowserHarness =>
  new LocalDebugBrowserHarness(
    storage,
    LOCAL_DEBUG_BROWSER_STORAGE_KEY,
    viewerSide,
  );
