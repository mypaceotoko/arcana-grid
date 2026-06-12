"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { getFlagAreaCoordinates } from "@/game";
import type {
  Coordinate,
  MatchPlayerState,
  PlayerMatchView,
  PlayerSide,
  Stance,
  UnitView,
} from "@/game";

import {
  buildBoardRows,
  describeUnit,
  getReserveUnitsForPlayer,
  getViewerSide,
  isOwnUnit,
  toCoordinateLabel,
} from "./display";
import type {
  LocalDebugEventLogEntry,
  LocalDebugFlagAttackCandidate,
  LocalDebugMoveCandidate,
  LocalDebugReserveCandidate,
  LocalDebugViewResponse,
} from "./harness";

type ViewerOption = {
  side: "north" | "south";
  href: string;
};

type LocalMatchDebugClientProps = {
  initialData: LocalDebugViewResponse;
  viewerOptions: readonly ViewerOption[];
};

type ApiSuccess<T> = { ok: true; value: T };
type ApiFailure = { ok: false; error: { code: string; message: string } };
type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

type ActionMode = "none" | "move" | "deploy" | "flag_attack" | "concede";
type SetupDraftPlacement = { unitId: string; position: Coordinate; stance: Stance };
type SetupSelectedCell = { position: Coordinate };
type ActionStep = "idle" | "destination" | "stance" | "confirm";
type BoardCandidate =
  | LocalDebugMoveCandidate
  | (LocalDebugReserveCandidate & { kind: "deploy" })
  | LocalDebugFlagAttackCandidate;

type CandidateKind = BoardCandidate["kind"];

const compactId = (id: string): string => id.replace("local-debug-", "");

const coordinateKey = (coordinate: Coordinate): string =>
  `${coordinate.row}:${coordinate.col}`;

const makeActionId = (): string =>
  `local-debug-action-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const getUnitToken = (unit: UnitView): string => {
  if (!unit.revealed) return "伏";
  return unit.card.cardName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
};

const getUnitClasses = (view: PlayerMatchView, unit: UnitView): string => {
  const own = isOwnUnit(view, unit);
  if (!unit.revealed) {
    return own
      ? "border-cyan-200 bg-cyan-300/20 text-cyan-50"
      : "border-fuchsia-200 bg-fuchsia-400/20 text-fuchsia-50";
  }

  return own
    ? "border-emerald-200 bg-emerald-400/25 text-emerald-50"
    : "border-amber-200 bg-amber-400/25 text-amber-50";
};

const stanceLabel = (stance: Stance | undefined): string => {
  if (stance === "attack") return "攻";
  if (stance === "defense") return "守";
  return "?";
};

const stanceFullLabel = (stance: Stance): string =>
  stance === "attack" ? "attack / 攻撃表示" : "defense / 防御表示";

const candidateLabel = (candidate: BoardCandidate): string => {
  switch (candidate.kind) {
    case "move":
      return "通常移動";
    case "engage":
      return "戦闘";
    case "deploy":
      return "リザーバー配置";
    case "flag_attack":
      return "旗攻撃";
  }
};

const candidateMarker = (candidate: BoardCandidate): string => {
  switch (candidate.kind) {
    case "move":
      return "○";
    case "engage":
      return "⚔";
    case "deploy":
      return "配";
    case "flag_attack":
      return "旗";
  }
};

const candidateClasses = (candidate: BoardCandidate | undefined): string => {
  switch (candidate?.kind) {
    case "move":
      return "border-cyan-300 bg-cyan-400/15 shadow-cyan-950/40";
    case "engage":
      return "border-rose-300 bg-rose-500/20 shadow-rose-950/40";
    case "deploy":
      return "border-emerald-300 bg-emerald-400/20 shadow-emerald-950/40";
    case "flag_attack":
      return "border-amber-200 bg-amber-400/25 shadow-amber-950/40";
    default:
      return "border-slate-700 bg-slate-950/80 hover:border-slate-500";
  }
};

const candidateToneClasses: Record<CandidateKind, string> = {
  move: "border-cyan-300/70 bg-cyan-400/15 text-cyan-50",
  engage: "border-rose-300/70 bg-rose-500/15 text-rose-50",
  deploy: "border-emerald-300/70 bg-emerald-400/15 text-emerald-50",
  flag_attack: "border-amber-200/80 bg-amber-400/15 text-amber-50",
};

const countCandidates = (
  candidates: readonly BoardCandidate[],
  kind: CandidateKind,
): number => candidates.filter((candidate) => candidate.kind === kind).length;

const flagSegments = (player: MatchPlayerState): boolean[] =>
  Array.from({ length: player.flag.maxDamage }, (_, index) => index < player.flag.damage);

const selectedActionLabel = (actionMode: ActionMode): string => {
  switch (actionMode) {
    case "move":
      return "移動/戦闘";
    case "deploy":
      return "リザーバー投入";
    case "flag_attack":
      return "旗攻撃";
    case "concede":
      return "投了";
    case "none":
      return "未選択";
  }
};

const playerDisplayName = (side: PlayerSide): string =>
  side === "south" ? "プレイヤー1" : "プレイヤー2";

const playerAreaLabel = (side: PlayerSide): string =>
  side === "south" ? "自陣" : "相手陣";

const formatPlayerLabel = (view: PlayerMatchView, player: MatchPlayerState): string =>
  `${playerDisplayName(player.side)}${player.id === view.viewerId ? " / 自分" : " / 相手"}`;

const UnitPill = ({
  view,
  unit,
  selected,
}: {
  view: PlayerMatchView;
  unit: UnitView;
  selected: boolean;
}) => {
  const revealedLabel = unit.revealed ? "公開" : "伏せ";
  const ownerLabel = isOwnUnit(view, unit) ? "自軍" : "敵軍";

  return (
    <span
      className={`relative flex h-full min-h-8 w-full flex-col items-center justify-center rounded-lg border px-0.5 text-[0.6rem] font-black leading-none shadow-inner sm:rounded-xl ${getUnitClasses(
        view,
        unit,
      )} ${selected ? "ring-2 ring-white ring-offset-1 ring-offset-slate-950" : ""}`}
      aria-label={`${ownerLabel} ${revealedLabel} unit ${compactId(unit.unitId)}`}
    >
      <span className="text-[0.78rem] sm:text-sm">{getUnitToken(unit)}</span>
      <span className="mt-0.5 rounded bg-slate-950/70 px-1 py-0.5 text-[0.48rem] font-bold leading-none text-slate-100">
        {unit.revealed ? stanceLabel(unit.stance) : "伏"}
      </span>
    </span>
  );
};

const FlagDamageMeter = ({ player }: { player: MatchPlayerState }) => (
  <div className="flex items-center gap-1" aria-label={`${player.side} flag damage ${player.flag.damage} of ${player.flag.maxDamage}`}>
    {flagSegments(player).map((damaged, index) => (
      <span
        key={`${player.id}-flag-${index}`}
        className={`h-2.5 flex-1 rounded-full border ${
          damaged
            ? "border-rose-200 bg-rose-400 shadow-sm shadow-rose-900/50"
            : "border-slate-600 bg-slate-800"
        }`}
      />
    ))}
  </div>
);

const FlagPanel = ({
  view,
  player,
  compact = false,
  active = false,
}: {
  view: PlayerMatchView;
  player: MatchPlayerState;
  compact?: boolean;
  active?: boolean;
}) => (
  <div
    className={`rounded-2xl border p-3 ${
      active
        ? "border-cyan-200 bg-cyan-300/15 ring-2 ring-cyan-200/50"
        : "border-slate-700/80 bg-slate-950/70"
    }`}
  >
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Flag
        </p>
        <p className="mt-0.5 text-sm font-bold text-white">
          {formatPlayerLabel(view, player)}
        </p>
        {active ? (
          <span className="mt-1 inline-flex rounded-full border border-cyan-200/70 bg-cyan-300/20 px-2 py-0.5 text-[0.62rem] font-black text-cyan-50">
            設定中
          </span>
        ) : null}
      </div>
      <div className="min-w-20 text-right">
        <p className="text-xs font-bold text-rose-100">
          {player.flag.damage} / {player.flag.maxDamage}
        </p>
        <FlagDamageMeter player={player} />
      </div>
    </div>
    {!compact ? (
      <p className="mt-2 text-[0.68rem] leading-4 text-slate-400">
        3段階の旗ダメージ。満了で旗破壊勝利です。
      </p>
    ) : null}
  </div>
);

const ReservePanel = ({
  view,
  player,
  selectedUnitId,
  disabled,
  onSelect,
}: {
  view: PlayerMatchView;
  player: MatchPlayerState;
  selectedUnitId: UnitView["unitId"] | null;
  disabled: boolean;
  onSelect: (unitId: UnitView["unitId"]) => void;
}) => {
  const reserves = getReserveUnitsForPlayer(view, player.id);
  const ownsPanel = player.id === view.viewerId;

  return (
    <div className="rounded-2xl border border-slate-700/80 bg-slate-900/80 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          Reserve
        </p>
        <span className="text-xs text-slate-400">
          {ownsPanel ? "自分のみ選択可" : "相手（秘匿）"}
        </span>
      </div>
      <div className="mt-3 flex snap-x gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {reserves.length === 0 ? (
          <span className="text-xs text-slate-500">なし</span>
        ) : (
          reserves.map((unit) => {
            const selected = selectedUnitId === unit.unitId;
            const selectable = ownsPanel && !disabled;
            return (
              <button
                key={unit.unitId}
                type="button"
                onClick={() => {
                  if (selectable) onSelect(unit.unitId);
                }}
                disabled={!selectable}
                className={`min-h-12 min-w-32 snap-start rounded-2xl border px-3 py-2 text-left text-xs transition focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-50 ${
                  selected
                    ? "border-emerald-200 bg-emerald-400/20 text-emerald-50 ring-2 ring-emerald-200/70"
                    : "border-slate-600 bg-slate-950/70 text-slate-100 hover:border-cyan-300"
                }`}
                aria-label={`${ownsPanel ? "own" : "opponent hidden"} reserve ${compactId(unit.unitId)}`}
              >
                <span className="font-bold">
                  {unit.revealed ? unit.card.cardName : "伏せカード"}
                </span>
                <span className="block text-slate-400">{compactId(unit.unitId)}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

const DetailPanel = ({ unit }: { unit: UnitView | null }) => {
  if (unit === null) {
    return (
      <section className="rounded-3xl border border-slate-700/80 bg-slate-900/80 p-4">
        <h2 className="text-base font-bold text-white">選択中カード</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          自軍ユニットまたはリザーバーを選ぶと、候補とカード情報をここに整理して表示します。
        </p>
      </section>
    );
  }

  const detail = describeUnit(unit);

  return (
    <section className="rounded-3xl border border-cyan-300/30 bg-slate-900/90 p-4 shadow-xl shadow-cyan-950/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white">選択中カード</h2>
          <p className="mt-1 text-xs text-slate-400">{compactId(detail.unitId)}</p>
        </div>
        <span className="rounded-full border border-cyan-300/40 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100">
          {detail.visibilityLabel}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Owner</dt>
          <dd className="break-words text-slate-100">{compactId(detail.ownerId)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Position</dt>
          <dd className="text-slate-100">{detail.positionLabel}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Status</dt>
          <dd className="text-slate-100">{detail.status}</dd>
        </div>
        {detail.cardBackKey !== undefined ? (
          <div>
            <dt className="text-xs text-slate-500">Card Back</dt>
            <dd className="break-words text-slate-100">{detail.cardBackKey}</dd>
          </div>
        ) : null}
        {detail.cardName !== undefined ? (
          <>
            <div className="col-span-2 rounded-2xl border border-slate-700 bg-slate-950/60 p-3">
              <dt className="text-xs text-slate-500">Card</dt>
              <dd className="text-base font-bold text-slate-100">{detail.cardName}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Stance</dt>
              <dd className="text-slate-100">{detail.stance}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Defense</dt>
              <dd className="font-bold text-slate-100">
                {detail.currentDefense} / {detail.baseDefense}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">ATK / DEF</dt>
              <dd className="text-slate-100">
                {detail.baseAttack} / {detail.baseDefense}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Move</dt>
              <dd className="text-slate-100">{detail.movementType}</dd>
            </div>
          </>
        ) : null}
      </dl>
    </section>
  );
};


const SetupPlacementMenu = ({
  coordinate,
  units,
  placementByUnitId,
  selectedCoordinateKey,
  selectedUnitId,
  selectedStance,
  selectedPlacement,
  isPending,
  onSelectUnit,
  onSelectStance,
  onPlace,
  onClear,
  onCancel,
}: {
  coordinate: Coordinate;
  units: readonly UnitView[];
  placementByUnitId: ReadonlyMap<string, SetupDraftPlacement>;
  selectedCoordinateKey: string;
  selectedUnitId: string | null;
  selectedStance: Stance | null;
  selectedPlacement: SetupDraftPlacement | undefined;
  isPending: boolean;
  onSelectUnit: (unitId: string) => void;
  onSelectStance: (stance: Stance) => void;
  onPlace: () => void;
  onClear: () => void;
  onCancel: () => void;
}) => (
  <div
    className="rounded-2xl border border-cyan-200/70 bg-slate-950/95 p-2.5 text-left shadow-2xl shadow-black/60 ring-1 ring-cyan-200/20 backdrop-blur"
    role="dialog"
    aria-label={`${toCoordinateLabel(coordinate)} initial placement menu`}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[0.58rem] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">配置メニュー</p>
        <h3 className="mt-0.5 text-sm font-black text-white">{toCoordinateLabel(coordinate)}</h3>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-[0.65rem] font-bold text-slate-200"
      >
        キャンセル
      </button>
    </div>

    <div className="mt-2 grid max-h-36 grid-cols-2 gap-1.5 overflow-y-auto pr-1">
      {units.map((unit) => {
        const placement = placementByUnitId.get(unit.unitId);
        const placedAtSelectedCell = placement !== undefined && coordinateKey(placement.position) === selectedCoordinateKey;
        const disabled = placement !== undefined && !placedAtSelectedCell;
        const selected = selectedUnitId === unit.unitId;
        const cardName = unit.revealed ? unit.card.cardName : compactId(unit.unitId);
        return (
          <button
            key={`setup-popover-card-${unit.unitId}`}
            type="button"
            onClick={() => onSelectUnit(unit.unitId)}
            disabled={disabled || isPending}
            className={`min-h-10 min-w-0 rounded-xl border px-2 py-1.5 text-left text-[0.68rem] leading-tight disabled:cursor-not-allowed disabled:opacity-40 ${
              selected
                ? "border-cyan-200 bg-cyan-300/20 text-cyan-50 ring-1 ring-cyan-200/70"
                : disabled
                  ? "border-slate-800 bg-slate-950/70 text-slate-500"
                  : "border-slate-700 bg-slate-900 text-slate-200"
            }`}
            aria-pressed={selected}
          >
            <span className="block truncate font-black text-white">{cardName}</span>
            <span className="block truncate text-[0.58rem] text-slate-400">
              {placement === undefined ? "未配置" : placedAtSelectedCell ? "このマス" : "配置済み"}
            </span>
          </button>
        );
      })}
    </div>

    <div className="mt-2 grid grid-cols-2 gap-1.5">
      {(["attack", "defense"] as const).map((stance) => {
        const selected = selectedStance === stance;
        return (
          <button
            key={`setup-popover-stance-${stance}`}
            type="button"
            onClick={() => onSelectStance(stance)}
            className={`min-h-10 rounded-xl border px-2 py-1.5 text-xs font-black ${
              selected
                ? "border-cyan-200 bg-cyan-300/20 text-cyan-50 ring-1 ring-cyan-200/70"
                : "border-slate-700 bg-slate-900 text-slate-300"
            }`}
            aria-pressed={selected}
          >
            <span aria-hidden="true">{selected ? "✓ " : ""}</span>
            {stance === "attack" ? "攻撃" : "防御"}
          </button>
        );
      })}
    </div>

    <div className="mt-2 grid grid-cols-2 gap-1.5">
      <button
        type="button"
        onClick={onClear}
        disabled={selectedPlacement === undefined || isPending}
        className="min-h-10 rounded-xl border border-rose-300/50 bg-rose-500/10 px-2 py-2 text-xs font-bold text-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        配置解除
      </button>
      <button
        type="button"
        onClick={onPlace}
        disabled={selectedUnitId === null || selectedStance === null || isPending}
        className="min-h-10 rounded-xl border border-emerald-300 bg-emerald-400/20 px-2 py-2 text-xs font-black text-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        配置する
      </button>
    </div>
  </div>
);

const EventLog = ({ events }: { events: readonly LocalDebugEventLogEntry[] }) => (
  <details className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
    <summary className="cursor-pointer list-none text-base font-bold text-white focus:outline-none focus:ring-2 focus:ring-cyan-300">
      最新イベント <span className="text-xs font-normal text-slate-400">({events.length})</span>
    </summary>
    {events.length === 0 ? (
      <p className="mt-3 text-sm text-slate-400">まだイベントはありません。</p>
    ) : (
      <ol className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1 text-xs text-slate-200">
        {events.map((event) => (
          <li key={event.index} className="rounded-2xl bg-slate-950/70 p-3">
            <span className="font-bold text-cyan-200">
              #{event.index} {event.type}
            </span>
            <span className="mt-1 block text-slate-300">{event.summary}</span>
          </li>
        ))}
      </ol>
    )}
  </details>
);

export default function LocalMatchDebugClient({
  initialData,
  viewerOptions,
}: LocalMatchDebugClientProps) {
  const [data, setData] = useState(initialData);
  const [selectedUnitId, setSelectedUnitId] = useState<UnitView["unitId"] | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>("none");
  const [actionStep, setActionStep] = useState<ActionStep>("idle");
  const [candidates, setCandidates] = useState<readonly BoardCandidate[]>([]);
  const [selectedDestination, setSelectedDestination] = useState<BoardCandidate | null>(null);
  const [nextStance, setNextStance] = useState<Stance>("attack");
  const [setupSelectedCell, setSetupSelectedCell] = useState<SetupSelectedCell | null>(null);
  const [setupSelectedUnitId, setSetupSelectedUnitId] = useState<string | null>(null);
  const [setupSelectedStance, setSetupSelectedStance] = useState<Stance | null>(null);
  const [setupPlacements, setSetupPlacements] = useState<readonly SetupDraftPlacement[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const { view } = data;
  const viewerSide = getViewerSide(view);
  const boardRows = useMemo(
    () => buildBoardRows(view, viewerSide),
    [view, viewerSide],
  );
  const selectedUnit =
    view.units.find((unit) => unit.unitId === selectedUnitId) ?? null;
  const currentPlayer = view.players.find(
    (player) => player.id === view.currentTurnPlayerId,
  );
  const viewerPlayer = view.players.find((player) => player.id === view.viewerId);
  const isSetupPhase = view.phase === "setup";
  const setupSubmitted = viewerPlayer?.setupSubmitted ?? false;
  const ownSetupUnits = useMemo(
    () => isSetupPhase ? view.units.filter((unit) => unit.ownerId === view.viewerId) : [],
    [isSetupPhase, view.units, view.viewerId],
  );
  const setupPlacementByUnitId = useMemo(
    () => new Map(setupPlacements.map((placement) => [placement.unitId, placement])),
    [setupPlacements],
  );
  const setupPlacedUnitIds = useMemo(
    () => new Set(setupPlacements.map((placement) => placement.unitId)),
    [setupPlacements],
  );
  const setupAutoReserveUnits = useMemo(
    () => ownSetupUnits.filter((unit) => !setupPlacedUnitIds.has(unit.unitId)),
    [ownSetupUnits, setupPlacedUnitIds],
  );
  const setupAutoReserveUnitIds = useMemo(
    () => setupAutoReserveUnits.map((unit) => unit.unitId),
    [setupAutoReserveUnits],
  );
  const setupLegalCoordinateKeys = useMemo(
    () => new Set(data.setup.legalPlacementCoordinates.map(coordinateKey)),
    [data.setup.legalPlacementCoordinates],
  );
  const winner = view.players.find((player) => player.id === view.winnerPlayerId);
  const isViewerTurn = view.currentTurnPlayerId === view.viewerId;
  const isFinished = view.phase === "finished";
  const canStartTurnAction = !isFinished && isViewerTurn && !isPending;
  const canConcede = view.phase === "active" && !isPending;
  const candidatesByCoordinate = useMemo(
    () => new Map(candidates.map((candidate) => [coordinateKey(candidate.destination), candidate])),
    [candidates],
  );
  const boardColumnLabels = boardRows[0]?.cells.map((cell) => cell.coordinate.col) ?? [];
  const setupPlacementByCoordinate = useMemo(
    () => new Map(setupPlacements.map((placement) => [coordinateKey(placement.position), placement])),
    [setupPlacements],
  );
  const selectedSetupCoordinateKey = setupSelectedCell === null ? null : coordinateKey(setupSelectedCell.position);
  const selectedSetupPlacement = selectedSetupCoordinateKey === null
    ? undefined
    : setupPlacementByCoordinate.get(selectedSetupCoordinateKey);
  const firstPlayer = view.players.find((player) => player.side === "south");
  const secondPlayer = view.players.find((player) => player.side === "north");
  const displayPlayers = [firstPlayer, secondPlayer].filter(
    (player): player is MatchPlayerState => player !== undefined,
  );
  const activeSetupSide = isSetupPhase ? viewerSide : currentPlayer?.side;
  const firstPlayerSubmitted = firstPlayer?.setupSubmitted ?? false;
  const secondPlayerSubmitted = secondPlayer?.setupSubmitted ?? false;
  const setupIsHandoff = isSetupPhase && viewerSide === "south" && firstPlayerSubmitted && !secondPlayerSubmitted;
  const setupLockedForPlayer2 = isSetupPhase && viewerSide === "north" && !firstPlayerSubmitted;
  const flagCoordinateKeys = useMemo(() => {
    const coordinates = view.players.flatMap((player) => {
      const result = getFlagAreaCoordinates({
        side: player.side,
        boardSize: view.boardSize,
      });
      return result.ok ? [...result.value] : [];
    });
    return new Set(coordinates.map(coordinateKey));
  }, [view.boardSize, view.players]);

  const resetSelection = () => {
    setSelectedUnitId(null);
    setActionMode("none");
    setActionStep("idle");
    setCandidates([]);
    setSelectedDestination(null);
    setNextStance("attack");
  };

  const resetSetupSelection = () => {
    setSetupSelectedCell(null);
    setSetupSelectedUnitId(null);
    setSetupSelectedStance(null);
  };

  const resetSetupDraft = () => {
    resetSetupSelection();
    setSetupPlacements([]);
  };

  const applyViewResponse = (nextData: LocalDebugViewResponse) => {
    setData(nextData);
    resetSelection();
    resetSetupDraft();
  };

  const postJson = async <T,>(path: string, body: Record<string, unknown>): Promise<ApiResponse<T>> => {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await response.json()) as ApiResponse<T>;
  };

  const fetchBoardCandidates = (unitId: UnitView["unitId"]) => {
    setErrorMessage(null);
    startTransition(async () => {
      const [moveResponse, flagResponse] = await Promise.all([
        postJson<{ candidates: readonly LocalDebugMoveCandidate[] }>(
          "/debug/local-match/api/moves",
          { viewerSide, unitId },
        ),
        postJson<{ candidates: readonly LocalDebugFlagAttackCandidate[] }>(
          "/debug/local-match/api/flag-attacks",
          { viewerSide, unitId },
        ),
      ]);

      if (!moveResponse.ok) {
        resetSelection();
        setErrorMessage(moveResponse.error.message);
        return;
      }
      if (!flagResponse.ok) {
        resetSelection();
        setErrorMessage(flagResponse.error.message);
        return;
      }

      setSelectedUnitId(unitId);
      setActionMode("move");
      setCandidates([...moveResponse.value.candidates, ...flagResponse.value.candidates]);
      setSelectedDestination(null);
      setActionStep("destination");
    });
  };

  const fetchReserveCandidates = (unitId: UnitView["unitId"]) => {
    setErrorMessage(null);
    startTransition(async () => {
      const response = await postJson<{ candidates: readonly LocalDebugReserveCandidate[] }>(
        "/debug/local-match/api/reserve-candidates",
        { viewerSide, unitId },
      );

      if (!response.ok) {
        resetSelection();
        setErrorMessage(response.error.message);
        return;
      }

      setSelectedUnitId(unitId);
      setActionMode("deploy");
      setCandidates(response.value.candidates.map((candidate) => ({ ...candidate, kind: "deploy" })));
      setSelectedDestination(null);
      setActionStep("destination");
    });
  };

  const refreshView = (side: PlayerSide) => {
    setErrorMessage(null);
    startTransition(async () => {
      const response = await fetch(`/debug/local-match/api/state?viewer=${side}`);
      const payload = (await response.json()) as ApiResponse<LocalDebugViewResponse>;

      if (!payload.ok) {
        setErrorMessage(payload.error.message);
        return;
      }

      applyViewResponse(payload.value);
    });
  };

  const selectSetupUnit = (unitId: string) => {
    if (!isSetupPhase || setupSubmitted || isPending || setupSelectedCell === null) return;
    setSetupSelectedUnitId(unitId);
  };

  const clearSetupPlacement = (unitId: string) => {
    setSetupPlacements((previous) => previous.filter((placement) => placement.unitId !== unitId));
    setSetupSelectedUnitId(unitId);
  };

  const placeSetupSelection = () => {
    if (setupSelectedCell === null || setupSelectedUnitId === null || setupSelectedStance === null || setupSubmitted || isPending) return;
    const selectedKey = coordinateKey(setupSelectedCell.position);
    if (!setupLegalCoordinateKeys.has(selectedKey)) return;

    const existingAtCell = setupPlacementByCoordinate.get(selectedKey);
    const placedElsewhere = setupPlacements.some(
      (placement) => placement.unitId === setupSelectedUnitId && coordinateKey(placement.position) !== selectedKey,
    );
    if (placedElsewhere) return;
    if (existingAtCell !== undefined && existingAtCell.unitId !== setupSelectedUnitId) {
      setSetupPlacements((previous) => previous.filter((placement) => coordinateKey(placement.position) !== selectedKey));
    }

    setSetupPlacements((previous) => [
      ...previous.filter((placement) =>
        placement.unitId !== setupSelectedUnitId && coordinateKey(placement.position) !== selectedKey,
      ),
      { unitId: setupSelectedUnitId, position: setupSelectedCell.position, stance: setupSelectedStance },
    ]);
    resetSetupSelection();
  };

  const clearSelectedSetupPlacement = () => {
    if (selectedSetupPlacement === undefined) return;
    clearSetupPlacement(selectedSetupPlacement.unitId);
    setSetupSelectedStance(null);
  };

  const submitSetupPlacement = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const response = await postJson<LocalDebugViewResponse>(
        "/debug/local-match/api/action",
        {
          actionType: "SUBMIT_INITIAL_PLACEMENT",
          viewerSide,
          placements: setupPlacements.map((placement) => ({
            unitId: placement.unitId,
            position: placement.position,
            stance: placement.stance,
          })),
          reserveUnitIds: setupAutoReserveUnitIds,
          expectedStateVersion: view.stateVersion,
          actionId: makeActionId(),
        },
      );

      if (!response.ok) {
        setErrorMessage(response.error.message);
        return;
      }

      applyViewResponse(response.value);
    });
  };

  const submitSelectedAction = () => {
    if (actionMode === "concede") {
      setErrorMessage(null);
      startTransition(async () => {
        const response = await postJson<LocalDebugViewResponse>(
          "/debug/local-match/api/action",
          {
            actionType: "CONCEDE_MATCH",
            viewerSide,
            expectedStateVersion: view.stateVersion,
            actionId: makeActionId(),
          },
        );

        if (!response.ok) {
          setErrorMessage(response.error.message);
          return;
        }

        applyViewResponse(response.value);
      });
      return;
    }

    if (selectedUnitId === null || selectedDestination === null) return;

    const actionType =
      selectedDestination.kind === "flag_attack"
        ? "ATTACK_FLAG"
        : selectedDestination.kind === "deploy"
          ? "DEPLOY_RESERVE"
          : "MOVE_UNIT";

    const actionBody: Record<string, unknown> = {
      actionType,
      viewerSide,
      unitId: selectedUnitId,
      nextStance,
      stance: nextStance,
      expectedStateVersion: view.stateVersion,
      actionId: makeActionId(),
    };

    if (actionType === "ATTACK_FLAG") {
      actionBody.target = selectedDestination.destination;
    } else {
      actionBody.destination = selectedDestination.destination;
    }

    setErrorMessage(null);
    startTransition(async () => {
      const response = await postJson<LocalDebugViewResponse>(
        "/debug/local-match/api/action",
        actionBody,
      );

      if (!response.ok) {
        setErrorMessage(response.error.message);
        return;
      }

      applyViewResponse(response.value);
    });
  };

  const resetMatch = (fixture: "setup" | "active") => {
    setErrorMessage(null);
    startTransition(async () => {
      const response = await postJson<LocalDebugViewResponse>(
        "/debug/local-match/api/reset",
        { viewerSide, fixture },
      );

      if (!response.ok) {
        setErrorMessage(response.error.message);
        return;
      }

      applyViewResponse(response.value);
    });
  };

  const handleCellClick = (unit: UnitView | null, destination: Coordinate) => {
    if (isFinished) return;

    if (isSetupPhase) {
      if (setupSubmitted || setupLockedForPlayer2) return;
      const destinationKey = coordinateKey(destination);
      if (!setupLegalCoordinateKeys.has(destinationKey)) return;
      const draftAtCell = setupPlacementByCoordinate.get(destinationKey);
      setSetupSelectedCell({ position: destination });
      setSetupSelectedUnitId(draftAtCell?.unitId ?? null);
      setSetupSelectedStance(draftAtCell?.stance ?? null);
      return;
    }

    const candidate = candidatesByCoordinate.get(coordinateKey(destination));

    if (actionStep === "destination" && candidate !== undefined) {
      setSelectedDestination(candidate);
      setActionMode(candidate.kind === "deploy" ? "deploy" : candidate.kind === "flag_attack" ? "flag_attack" : "move");
      setActionStep("stance");
      return;
    }

    if (
      unit !== null &&
      unit.ownerId === view.viewerId &&
      unit.status === "board" &&
      canStartTurnAction
    ) {
      fetchBoardCandidates(unit.unitId);
      return;
    }

    resetSelection();
    setSelectedUnitId(unit?.unitId ?? null);
  };

  const confirmationText = (): string => {
    if (actionMode === "concede") {
      return "CONCEDE_MATCH: この対戦を投了し、相手を勝者にします。";
    }
    if (selectedUnitId === null || selectedDestination === null) {
      if (!isViewerTurn && view.phase === "active") return "相手の手番です。投了以外の操作はできません。";
      return "ユニットを選び、強調表示された候補マスをタップしてください。";
    }

    return `${selectedDestination.kind === "flag_attack" ? "ATTACK_FLAG" : selectedDestination.kind === "deploy" ? "DEPLOY_RESERVE" : "MOVE_UNIT"}: ${compactId(selectedUnitId)} → ${toCoordinateLabel(selectedDestination.destination)} (${candidateLabel(selectedDestination)}) / ${nextStance}表示`;
  };

  return (
    <main className="min-h-dvh overflow-x-hidden bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:max-w-3xl sm:px-4 lg:max-w-5xl">
        <header className="sticky top-0 z-30 rounded-b-3xl border border-slate-800 bg-slate-950/95 p-3 shadow-2xl shadow-black/30 backdrop-blur sm:rounded-3xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.24em] text-cyan-300/80">
                Debug / Local Match
              </p>
              <h1 className="mt-1 truncate text-xl font-bold tracking-[0.04em] text-white sm:text-2xl">
                Local Match
              </h1>
            </div>
            <div className={`rounded-2xl border px-3 py-2 text-right text-xs font-bold ${isViewerTurn ? "border-emerald-300/60 bg-emerald-400/15 text-emerald-50" : "border-slate-700 bg-slate-900 text-slate-300"}`}>
              <span className="block text-[0.58rem] uppercase tracking-[0.18em] text-slate-400">Turn</span>
              {currentPlayer === undefined ? "—" : playerDisplayName(currentPlayer.side)}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1.5 text-center text-[0.66rem] text-slate-300">
            <span className="rounded-xl border border-slate-700 bg-slate-900/80 px-2 py-1.5">{view.phase}</span>
            <span className="rounded-xl border border-slate-700 bg-slate-900/80 px-2 py-1.5">T{view.turnNumber}</span>
            <span className="rounded-xl border border-slate-700 bg-slate-900/80 px-2 py-1.5">v{view.stateVersion}</span>
            <span className="rounded-xl border border-slate-700 bg-slate-900/80 px-2 py-1.5">{viewerSide}視点</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {displayPlayers.map((player) => (
              <FlagPanel
                key={player.id}
                view={view}
                player={player}
                compact
                active={isSetupPhase && player.side === activeSetupSide}
              />
            ))}
          </div>
        </header>

        {view.phase === "finished" ? (
          <section className="rounded-3xl border border-amber-200/60 bg-amber-400/15 p-4 text-amber-50 shadow-xl shadow-amber-950/30" role="status">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-100/80">Result</p>
            <h2 className="mt-1 text-2xl font-black">{winner === undefined ? "—" : playerDisplayName(winner.side)} 勝利</h2>
            <p className="mt-2 text-sm">reason: {view.winReason ?? "—"}</p>
          </section>
        ) : null}

        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-3">
          <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="player view tabs">
            {viewerOptions.map((option) => {
              const selected = option.side === viewerSide;
              const tabClasses = `min-h-12 rounded-2xl border px-3 py-2 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-cyan-300 ${
                selected
                  ? "border-cyan-300 bg-cyan-300/15 text-cyan-50"
                  : "border-slate-700 bg-slate-950/60 text-slate-300"
              }`;
              const tabContent = (
                <>
                  <span className="block text-[0.6rem] uppercase tracking-[0.2em] text-slate-400">
                    {isSetupPhase ? "setup" : "viewer"}
                  </span>
                  <span className="mt-0.5 block font-bold">{playerDisplayName(option.side)}</span>
                </>
              );

              if (isSetupPhase) {
                return (
                  <button
                    key={option.side}
                    type="button"
                    disabled
                    className={`${tabClasses} disabled:cursor-not-allowed disabled:opacity-80`}
                    role="tab"
                    aria-selected={selected}
                  >
                    {tabContent}
                  </button>
                );
              }

              return (
                <Link
                  key={option.side}
                  href={option.href}
                  onClick={() => {
                    resetSelection();
                    refreshView(option.side);
                  }}
                  className={tabClasses}
                  role="tab"
                  aria-selected={selected}
                >
                  {tabContent}
                </Link>
              );
            })}
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-400">
            {isSetupPhase
              ? "setup中は相手側へ自由に切り替えず、現在の設定担当者だけを表示します。"
              : isFinished
                ? "勝敗確定後のため盤面操作は停止しています。"
                : isViewerTurn
                  ? "自分の手番です。盤面の自軍ユニットかリザーバーを選択してください。"
                  : "相手の手番です。投了のみ実行できます。"}
          </p>
        </section>

        {errorMessage !== null ? (
          <div className="rounded-2xl border border-rose-300/50 bg-rose-500/15 p-3 text-sm font-semibold text-rose-100" role="alert">
            操作できません: {errorMessage}
          </div>
        ) : null}

        {isPending ? (
          <div className="rounded-2xl border border-cyan-300/40 bg-cyan-300/10 p-3 text-sm font-semibold text-cyan-100" role="status">
            処理中… サーバーハーネスの応答を待っています。
          </div>
        ) : null}

        {isSetupPhase ? (
          <section className="w-full min-w-0 max-w-full overflow-x-hidden rounded-3xl border border-cyan-300/30 bg-cyan-400/10 p-3">
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="min-w-0">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-cyan-100/70">Setup</p>
                <h2 className="mt-1 text-lg font-black text-cyan-50">
                  {playerDisplayName(viewerSide)}設定中 <span className="text-sm font-bold text-cyan-100/80">({playerAreaLabel(viewerSide)})</span>
                </h2>
                <p className="mt-1 text-xs text-cyan-100/80">盤面の配置可能マスを先にタップし、その場所へ置くカードとattack / defenseを選びます。</p>
              </div>
              <div className="grid w-full min-w-0 grid-cols-2 gap-1 text-center text-[0.65rem] font-bold sm:w-auto sm:min-w-28">
                <span className="rounded-xl border border-slate-700 bg-slate-950/70 p-1">配置 {setupPlacements.length}/6</span>
                <span className="rounded-xl border border-slate-700 bg-slate-950/70 p-1">リザーバー {setupAutoReserveUnits.length}/2</span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2" role="tablist" aria-label="setup player tabs">
              {(["south", "north"] as const).map((side) => {
                const active = side === viewerSide;
                const submitted = side === "south" ? firstPlayerSubmitted : secondPlayerSubmitted;
                return (
                  <button
                    key={`setup-tab-${side}`}
                    type="button"
                    disabled
                    className={`min-h-11 rounded-2xl border px-3 py-2 text-left text-xs ${
                      active
                        ? "border-cyan-200 bg-cyan-300/20 text-cyan-50 ring-2 ring-cyan-200/60"
                        : "border-slate-700 bg-slate-950/70 text-slate-400"
                    }`}
                    role="tab"
                    aria-selected={active}
                  >
                    <span className="block font-black">{playerDisplayName(side)}</span>
                    <span className="text-[0.62rem]">{submitted ? "確定済み" : active ? "設定中" : "未完了"}</span>
                  </button>
                );
              })}
            </div>

            {setupLockedForPlayer2 ? (
              <div className="mt-4 rounded-3xl border border-slate-700 bg-slate-950/80 p-5 text-center">
                <h3 className="text-lg font-black text-white">プレイヤー1設定中</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">プレイヤー1の確定後、引き渡し画面からプレイヤー2の設定を開始します。</p>
              </div>
            ) : setupIsHandoff ? (
              <div className="mt-4 rounded-3xl border border-emerald-300/40 bg-emerald-400/10 p-5 text-center">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-emerald-100/70">Handoff</p>
                <h3 className="mt-2 text-2xl font-black text-emerald-50">プレイヤー1の配置が完了しました</h3>
                <p className="mt-3 text-sm leading-6 text-emerald-50/85">端末をプレイヤー2へ渡してください。プレイヤー1のカード名、配置、stance、リザーバー内容はこの画面には表示しません。</p>
                <button
                  type="button"
                  onClick={() => refreshView("north")}
                  disabled={isPending}
                  className="mt-5 min-h-12 w-full rounded-2xl border border-cyan-200 bg-cyan-300/20 px-4 py-3 text-sm font-black text-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  プレイヤー2の設定を始める
                </button>
              </div>
            ) : (
              <div className="mt-3 grid gap-2">
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-200">
                  <span className="rounded-2xl border border-slate-700 bg-slate-950/70 p-2">
                    配置 <strong className="text-white">{setupPlacements.length}/6</strong>
                  </span>
                  <span className="rounded-2xl border border-slate-700 bg-slate-950/70 p-2">
                    予備 <strong className="text-white">{setupAutoReserveUnits.length}/2</strong>
                  </span>
                </div>
                <p className="rounded-2xl border border-slate-700 bg-slate-950/70 p-2 text-xs leading-5 text-slate-300">
                  盤面の「初」マスをタップして、その場の小型メニューでカード・攻撃/防御を選びます。旗マスには配置できません。
                </p>
                <button
                  type="button"
                  disabled={setupSubmitted || isPending || setupPlacements.length !== 6 || setupAutoReserveUnits.length !== 2}
                  onClick={submitSetupPlacement}
                  className="min-h-11 rounded-2xl border border-emerald-300 bg-emerald-400/20 px-3 py-2 text-sm font-black text-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  配置を確定
                </button>
              </div>
            )}
          </section>
        ) : null}

        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-2 shadow-2xl shadow-black/20 sm:p-3">
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <div>
              <h2 className="text-base font-bold text-white">8×8 Board</h2>
              <p className="text-[0.68rem] text-slate-400">座標は現在の{viewerSide}視点で反転表示</p>
            </div>
            <span className="rounded-full border border-slate-700 bg-slate-950/80 px-2 py-1 text-xs text-slate-300">
              {view.boardSize.width}×{view.boardSize.height}
            </span>
          </div>
          <div className="mb-2 grid grid-cols-4 gap-1 text-center text-[0.58rem] font-bold sm:text-[0.68rem]">
            <span className="rounded-full border border-cyan-300/50 px-1.5 py-1 text-cyan-100">○ 移動</span>
            <span className="rounded-full border border-rose-300/50 px-1.5 py-1 text-rose-100">⚔ 戦闘</span>
            <span className="rounded-full border border-emerald-300/50 px-1.5 py-1 text-emerald-100">配 予備</span>
            <span className="rounded-full border border-amber-200/60 px-1.5 py-1 text-amber-100">旗 攻撃</span>
          </div>
          <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-1 sm:grid-cols-[1.25rem_minmax(0,1fr)]">
            <div aria-hidden="true" />
            <div className="grid grid-cols-8 gap-1 text-center text-[0.55rem] font-bold text-slate-500">
              {boardColumnLabels.map((column) => (
                <span key={`col-${column}`}>c{column}</span>
              ))}
            </div>
            {boardRows.map((row, rowDisplayIndex) => (
              <div key={`row-${row.rowIndex}`} className="contents">
                <div className="flex items-center justify-center text-[0.55rem] font-bold text-slate-500">r{row.rowIndex}</div>
                <div className="grid w-full grid-cols-8 gap-1" aria-label="8 by 8 local debug board">
                  {row.cells.map((cell, cellDisplayIndex) => {
                    const setupDraft = setupPlacements.find((placement) => coordinateKey(placement.position) === coordinateKey(cell.coordinate));
                    const setupDraftUnit = setupDraft === undefined ? null : ownSetupUnits.find((unit) => unit.unitId === setupDraft.unitId) ?? null;
                    const unit = isSetupPhase ? setupDraftUnit : cell.unit;
                    const coordinate = coordinateKey(cell.coordinate);
                    const isFlagCell = flagCoordinateKeys.has(coordinate);
                    const setupLegal = isSetupPhase && !setupSubmitted && !setupLockedForPlayer2 && setupLegalCoordinateKeys.has(coordinate);
                    const setupCellSelected = selectedSetupCoordinateKey === coordinate;
                    const showSetupMenu = setupCellSelected && setupLegal;
                    const popoverHorizontalClass = cellDisplayIndex <= 2 ? "left-0" : cellDisplayIndex >= 5 ? "right-0" : "left-1/2 -translate-x-1/2";
                    const popoverVerticalClass = rowDisplayIndex >= 4 ? "bottom-[calc(100%+0.35rem)]" : "top-[calc(100%+0.35rem)]";
                    const selected = unit?.unitId === selectedUnitId || setupCellSelected;
                    const candidate = candidatesByCoordinate.get(coordinate);
                    const destinationSelected = selectedDestination !== null && coordinateKey(selectedDestination.destination) === coordinate;
                    const cellLabel = `${toCoordinateLabel(cell.coordinate)}${isFlagCell ? " 旗 配置不可" : ""}${candidate === undefined ? "" : ` ${candidateLabel(candidate)}`}${unit === null ? " empty" : ` ${isOwnUnit(view, unit) ? "own" : "enemy"} ${unit.revealed ? "revealed" : "hidden"}`}`;
                    return (
                      <div key={coordinate} className="relative min-w-0">
                      <button
                        type="button"
                        onClick={() => handleCellClick(unit, cell.coordinate)}
                        disabled={isFinished}
                        className={`relative aspect-square w-full min-w-0 rounded-lg border p-0.5 text-[0.55rem] shadow-lg transition focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-70 sm:rounded-xl ${
                          destinationSelected || setupCellSelected
                            ? "border-white bg-white/20 ring-2 ring-white"
                            : selected
                              ? "border-white bg-white/10 ring-2 ring-white/80"
                              : setupLegal
                                ? "border-cyan-200 bg-cyan-400/15 ring-1 ring-cyan-200/60"
                                : isFlagCell
                                  ? "border-amber-200/70 bg-amber-400/15 text-amber-50"
                                  : candidateClasses(candidate)
                        }`}
                        aria-label={cellLabel}
                      >
                        <span className="absolute left-1 top-0.5 z-10 rounded bg-slate-950/70 px-0.5 text-[0.48rem] font-bold text-slate-400">
                          {cell.coordinate.row},{cell.coordinate.col}
                        </span>
                        {candidate !== undefined ? (
                          <span className={`absolute right-0.5 top-0.5 z-20 rounded-full border px-1 text-[0.55rem] font-black ${candidateToneClasses[candidate.kind]}`}>
                            {candidateMarker(candidate)}
                          </span>
                        ) : null}
                        {setupLegal ? (
                          <span className="absolute right-0.5 top-0.5 z-20 rounded-full border border-cyan-200 bg-cyan-400/25 px-1 text-[0.55rem] font-black text-cyan-50">初</span>
                        ) : null}
                        {isFlagCell ? (
                          <span className="absolute inset-x-1 bottom-0.5 z-10 rounded border border-amber-200/60 bg-amber-400/20 px-0.5 text-center text-[0.5rem] font-black text-amber-50">⚑旗</span>
                        ) : null}
                        {unit === null ? (
                          <span className="flex h-full items-center justify-center text-[0.6rem] text-slate-700">·</span>
                        ) : (
                          <UnitPill view={view} unit={unit} selected={selected} />
                        )}
                      </button>
                      {showSetupMenu ? (
                        <div className={`absolute ${popoverHorizontalClass} ${popoverVerticalClass} z-50 w-64 max-w-[calc(100vw-1.5rem)]`}>
                          <SetupPlacementMenu
                            coordinate={cell.coordinate}
                            units={ownSetupUnits}
                            placementByUnitId={setupPlacementByUnitId}
                            selectedCoordinateKey={coordinate}
                            selectedUnitId={setupSelectedUnitId}
                            selectedStance={setupSelectedStance}
                            selectedPlacement={selectedSetupPlacement}
                            isPending={isPending}
                            onSelectUnit={selectSetupUnit}
                            onSelectStance={setSetupSelectedStance}
                            onPlace={placeSetupSelection}
                            onClear={clearSelectedSetupPlacement}
                            onCancel={resetSetupSelection}
                          />
                        </div>
                      ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {!isSetupPhase ? (
          <section className="rounded-3xl border border-slate-800 bg-slate-900/95 p-3 shadow-2xl shadow-black/30 sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-white">主要操作</h2>
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${isViewerTurn ? "border-emerald-300/60 bg-emerald-400/15 text-emerald-50" : "border-slate-700 bg-slate-950 text-slate-400"}`}>
              {isViewerTurn ? "自分の手番" : "操作制限中"}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
            <p className="rounded-2xl border border-slate-700 bg-slate-950/70 p-2">操作: <span className="font-bold text-white">{selectedActionLabel(actionMode)}</span></p>
            <p className="rounded-2xl border border-slate-700 bg-slate-950/70 p-2">選択: <span className="font-bold text-white">{selectedUnitId === null ? "—" : compactId(selectedUnitId)}</span></p>
            <p className="col-span-2 rounded-2xl border border-slate-700 bg-slate-950/70 p-2">
              候補: ○{countCandidates(candidates, "move")} / ⚔{countCandidates(candidates, "engage")} / 配{countCandidates(candidates, "deploy")} / 旗{countCandidates(candidates, "flag_attack")}
            </p>
            <p className="col-span-2 rounded-2xl border border-slate-700 bg-slate-950/70 p-2">
              対象: {selectedDestination === null ? "—" : `${toCoordinateLabel(selectedDestination.destination)} (${candidateLabel(selectedDestination)})`}
            </p>
          </div>

          {actionStep === "stance" || actionStep === "confirm" ? (
            <div className="mt-4 grid gap-2">
              <p className="text-xs font-bold text-slate-300">実行後の表示形式</p>
              <div className="grid grid-cols-2 gap-2">
                {(["attack", "defense"] as const).map((stance) => (
                  <button
                    key={stance}
                    type="button"
                    onClick={() => {
                      setNextStance(stance);
                      setActionStep("confirm");
                    }}
                    className={`min-h-14 rounded-2xl border px-3 py-3 text-sm font-black ${
                      nextStance === stance
                        ? "border-cyan-200 bg-cyan-300/20 text-cyan-50 ring-2 ring-cyan-200/70"
                        : "border-slate-700 bg-slate-950 text-slate-300"
                    }`}
                    aria-label={`choose ${stance} stance`}
                  >
                    <span className="block text-lg">{stanceLabel(stance)}</span>
                    {stanceFullLabel(stance)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-950/70 p-3 text-xs leading-5 text-slate-300">
            {confirmationText()}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={resetSelection}
              className="min-h-12 rounded-2xl border border-slate-600 bg-slate-950 px-3 py-3 text-sm font-bold text-slate-200"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={submitSelectedAction}
              disabled={
                isPending ||
                (actionMode !== "concede" &&
                  (selectedUnitId === null || selectedDestination === null || actionStep !== "confirm"))
              }
              className="min-h-12 rounded-2xl border border-emerald-300 bg-emerald-400/20 px-3 py-3 text-sm font-bold text-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              確認して実行
            </button>
          </div>
          </section>
        ) : null}

        {!isSetupPhase ? (
          <section className="grid gap-3 lg:grid-cols-2">
            {displayPlayers.map((player) => (
              <div key={player.id} className="grid gap-3">
                <FlagPanel view={view} player={player} active={isSetupPhase && player.side === activeSetupSide} />
                <ReservePanel
                  view={view}
                  player={player}
                  selectedUnitId={selectedUnitId}
                  disabled={!canStartTurnAction}
                  onSelect={fetchReserveCandidates}
                />
              </div>
            ))}
          </section>
        ) : null}

        {!isSetupPhase ? <DetailPanel unit={selectedUnit} /> : null}

        {!isSetupPhase ? (
          <section className="rounded-3xl border border-rose-300/30 bg-rose-500/10 p-4">
          <h2 className="text-base font-bold text-rose-50">危険操作</h2>
          <p className="mt-2 text-xs leading-5 text-rose-100/80">
            投了・リセットは確認用ボタンを分けています。activeフェーズなら自分の手番以外でもCONCEDE_MATCHを送信できます。
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!canConcede}
              onClick={() => {
                resetSelection();
                setActionMode("concede");
                setActionStep("confirm");
              }}
              className="min-h-12 rounded-2xl border border-rose-300/60 bg-rose-400/15 px-3 py-3 text-sm font-bold text-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              投了確認
            </button>
            <button
              type="button"
              disabled={actionMode !== "concede" || isPending}
              onClick={submitSelectedAction}
              className="min-h-12 rounded-2xl border border-rose-200 bg-rose-500/25 px-3 py-3 text-sm font-bold text-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              投了実行
            </button>
          </div>
          </section>
        ) : null}

        <EventLog events={data.events} />

        <details className="mb-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
          <summary className="cursor-pointer list-none text-base font-bold text-white focus:outline-none focus:ring-2 focus:ring-cyan-300">
            リセット / 詳細
          </summary>
          <p className="mt-3 text-xs leading-5 text-slate-400">{data.stateStorageNote}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => resetMatch("setup")}
              className="min-h-12 rounded-3xl border border-cyan-300/50 bg-cyan-500/10 px-4 py-3 text-sm font-bold text-cyan-100"
            >
              setupへリセット
            </button>
            <button
              type="button"
              onClick={() => resetMatch("active")}
              className="min-h-12 rounded-3xl border border-rose-300/50 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-100"
            >
              activeへリセット
            </button>
          </div>
        </details>
      </div>
    </main>
  );
}
