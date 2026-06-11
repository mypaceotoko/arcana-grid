import type {
  CardSnapshot,
  HiddenUnitView,
  MatchPlayerState,
  MatchState,
  MovementRule,
  PlayerMatchView,
  Result,
  RevealedUnitView,
  RuleError,
  UnitState,
  UnitView,
  UnitVisibility,
  MatchPlayerId,
} from "../../core";
import type { Coordinate } from "../../core";
import { getUnitVisibility } from "./visibility";

export type BuildUnitViewInput = {
  unit: UnitState;
  viewerId: MatchPlayerId;
  visibilities: readonly UnitVisibility[];
  cardBackKey: string;
};

export type BuildPlayerMatchViewInput = {
  state: MatchState;
  viewerId: MatchPlayerId;
  cardBackKey: string;
};

const makeRuleError = (
  code: RuleError["code"],
  message: string,
  details?: Record<string, unknown>,
): RuleError => ({ code, message, details });

const cloneCoordinate = (coordinate: Coordinate): Coordinate => ({
  row: coordinate.row,
  col: coordinate.col,
});

const cloneNullableCoordinate = (coordinate: Coordinate | null): Coordinate | null =>
  coordinate === null ? null : cloneCoordinate(coordinate);

const cloneMovementRule = (rule: MovementRule): MovementRule => {
  if (rule.kind === "line") {
    return {
      kind: "line",
      directions: rule.directions.map(cloneCoordinate),
      maxDistance: rule.maxDistance,
    };
  }

  return {
    kind: "offset",
    offsets: rule.offsets.map(cloneCoordinate),
    canJump: rule.canJump,
  };
};

const cloneCardSnapshot = (card: CardSnapshot): CardSnapshot => ({
  ...card,
  movementRule: cloneMovementRule(card.movementRule),
  abilityData: { ...card.abilityData },
});

const buildRevealedUnitView = (unit: UnitState): RevealedUnitView => ({
  revealed: true,
  unitId: unit.id,
  ownerId: unit.ownerId,
  position: cloneNullableCoordinate(unit.position),
  status: unit.status,
  stance: unit.stance,
  currentDefense: unit.currentDefense,
  card: cloneCardSnapshot(unit.card),
});

const buildHiddenUnitView = (
  unit: UnitState,
  cardBackKey: string,
): HiddenUnitView => ({
  revealed: false,
  unitId: unit.id,
  ownerId: unit.ownerId,
  position: cloneNullableCoordinate(unit.position),
  status: unit.status,
  cardBackKey,
});

export const buildUnitView = ({
  unit,
  viewerId,
  visibilities,
  cardBackKey,
}: BuildUnitViewInput): UnitView => {
  const visibility = getUnitVisibility({ unit, viewerId, visibilities });

  if (visibility === "hidden") {
    return buildHiddenUnitView(unit, cardBackKey);
  }

  return buildRevealedUnitView(unit);
};

const clonePlayerState = (player: MatchPlayerState): MatchPlayerState => ({
  ...player,
  reserveUnitIds: [...player.reserveUnitIds],
  flag: { ...player.flag },
});

const compareByOwnerThenUnit = (left: UnitState, right: UnitState): number => {
  const ownerComparison = left.ownerId.localeCompare(right.ownerId);

  if (ownerComparison !== 0) {
    return ownerComparison;
  }

  return left.id.localeCompare(right.id);
};

export const buildPlayerMatchView = ({
  state,
  viewerId,
  cardBackKey,
}: BuildPlayerMatchViewInput): Result<PlayerMatchView, RuleError> => {
  const viewer = state.players.find((player) => player.id === viewerId);

  if (viewer === undefined) {
    return {
      ok: false,
      error: makeRuleError("VIEWER_NOT_IN_MATCH", "Viewer is not in match.", {
        viewerId,
        matchId: state.id,
      }),
    };
  }

  const sortedUnits = [...state.units].sort(compareByOwnerThenUnit);

  return {
    ok: true,
    value: {
      matchId: state.id,
      gameMode: state.gameMode,
      rulesVersion: state.rulesVersion,
      boardSize: { ...state.boardSize },
      phase: state.phase,
      viewerId,
      players: state.players.map(clonePlayerState),
      units: sortedUnits.map((unit) =>
        buildUnitView({
          unit,
          viewerId,
          visibilities: state.unitVisibilities,
          cardBackKey,
        }),
      ),
      currentTurnPlayerId: state.currentTurnPlayerId,
      turnNumber: state.turnNumber,
      stateVersion: state.stateVersion,
      winnerPlayerId: state.winnerPlayerId,
      winReason: state.winReason,
    },
  };
};

export const buildPlayerMatchViews = (
  state: MatchState,
  cardBackKey: string,
): Result<readonly PlayerMatchView[], RuleError> => {
  const views: PlayerMatchView[] = [];

  for (const player of [...state.players].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    const view = buildPlayerMatchView({
      state,
      viewerId: player.id,
      cardBackKey,
    });

    if (!view.ok) {
      return view;
    }

    views.push(view.value);
  }

  return { ok: true, value: views };
};
