import type { Coordinate, PlayerMatchView, PlayerSide, UnitView } from "@/game";

export type LocalDebugViewerSide = PlayerSide;

export type BoardCellView = {
  coordinate: Coordinate;
  unit: UnitView | null;
};

export type BoardRowView = {
  rowIndex: number;
  cells: BoardCellView[];
};

export type UnitDetailView = {
  unitId: string;
  ownerId: string;
  status: UnitView["status"];
  positionLabel: string;
  visibilityLabel: "公開" | "伏せ";
  cardBackKey?: string;
  stance?: string;
  currentDefense?: number;
  cardName?: string;
  movementType?: string;
  baseAttack?: number;
  baseDefense?: number;
  attribute?: string;
};

const range = (length: number): number[] =>
  Array.from({ length }, (_, index) => index);

export const getDisplayRows = (
  boardHeight: number,
  viewerSide: LocalDebugViewerSide,
): number[] => {
  const rows = range(boardHeight);
  return viewerSide === "north" ? rows.reverse() : rows;
};

export const getDisplayColumns = (
  boardWidth: number,
  viewerSide: LocalDebugViewerSide,
): number[] => {
  const columns = range(boardWidth);
  return viewerSide === "north" ? columns.reverse() : columns;
};

export const toCoordinateLabel = (coordinate: Coordinate | null): string =>
  coordinate === null ? "—" : `r${coordinate.row} / c${coordinate.col}`;

export const findUnitAtCoordinate = (
  units: readonly UnitView[],
  coordinate: Coordinate,
): UnitView | null =>
  units.find(
    (unit) =>
      unit.status === "board" &&
      unit.position?.row === coordinate.row &&
      unit.position.col === coordinate.col,
  ) ?? null;

export const buildBoardRows = (
  view: PlayerMatchView,
  viewerSide: LocalDebugViewerSide,
): BoardRowView[] => {
  const displayRows = getDisplayRows(view.boardSize.height, viewerSide);
  const displayColumns = getDisplayColumns(view.boardSize.width, viewerSide);

  return displayRows.map((rowIndex) => ({
    rowIndex,
    cells: displayColumns.map((colIndex) => {
      const coordinate = { row: rowIndex, col: colIndex };
      return {
        coordinate,
        unit: findUnitAtCoordinate(view.units, coordinate),
      };
    }),
  }));
};

export const getPlayerSide = (
  view: PlayerMatchView,
  playerId: PlayerMatchView["viewerId"],
): PlayerSide => {
  const player = view.players.find((candidate) => candidate.id === playerId);
  return player?.side ?? "south";
};

export const getViewerSide = (view: PlayerMatchView): PlayerSide =>
  getPlayerSide(view, view.viewerId);

export const isOwnUnit = (view: PlayerMatchView, unit: UnitView): boolean =>
  unit.ownerId === view.viewerId;

export const describeUnit = (unit: UnitView): UnitDetailView => {
  if (!unit.revealed) {
    return {
      unitId: unit.unitId,
      ownerId: unit.ownerId,
      status: unit.status,
      positionLabel: toCoordinateLabel(unit.position),
      visibilityLabel: "伏せ",
      cardBackKey: unit.cardBackKey,
    };
  }

  return {
    unitId: unit.unitId,
    ownerId: unit.ownerId,
    status: unit.status,
    positionLabel: toCoordinateLabel(unit.position),
    visibilityLabel: "公開",
    stance: unit.stance,
    currentDefense: unit.currentDefense,
    cardName: unit.card.cardName,
    movementType: unit.card.movementType,
    baseAttack: unit.card.baseAttack,
    baseDefense: unit.card.baseDefense,
    attribute: unit.card.attribute,
  };
};

export const getReserveUnitsForPlayer = (
  view: PlayerMatchView,
  playerId: PlayerMatchView["viewerId"],
): UnitView[] => {
  const player = view.players.find((candidate) => candidate.id === playerId);
  if (player === undefined) return [];

  const reserveIds = new Set(player.reserveUnitIds);
  return view.units.filter(
    (unit) => unit.status === "reserve" && reserveIds.has(unit.unitId),
  );
};
