"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

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
  getPlayerSide,
  getReserveUnitsForPlayer,
  getViewerSide,
  isOwnUnit,
  toCoordinateLabel,
} from "./display";
import type {
  LocalDebugEventLogEntry,
  LocalDebugMoveCandidate,
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

type MoveStep = "idle" | "destination" | "stance" | "confirm";

const formatPlayerLabel = (player: MatchPlayerState): string =>
  `${player.side} / ${player.id}`;

const compactId = (id: string): string => id.replace("local-debug-", "");

const coordinateKey = (coordinate: Coordinate): string =>
  `${coordinate.row}:${coordinate.col}`;

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
      ? "border-cyan-300/70 bg-cyan-400/15 text-cyan-100"
      : "border-fuchsia-300/70 bg-fuchsia-500/15 text-fuchsia-100";
  }

  return own
    ? "border-emerald-300/80 bg-emerald-400/20 text-emerald-50"
    : "border-amber-300/80 bg-amber-400/20 text-amber-50";
};

const UnitPill = ({
  view,
  unit,
  selected,
}: {
  view: PlayerMatchView;
  unit: UnitView;
  selected: boolean;
}) => (
  <span
    className={`flex h-full min-h-8 w-full items-center justify-center rounded-xl border px-1 text-[0.62rem] font-bold shadow-inner ${getUnitClasses(
      view,
      unit,
    )} ${selected ? "ring-2 ring-white" : ""}`}
  >
    {getUnitToken(unit)}
  </span>
);

const FlagPanel = ({ player }: { player: MatchPlayerState }) => (
  <div className="rounded-2xl border border-slate-700/80 bg-slate-900/80 p-3">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          Flag
        </p>
        <p className="mt-1 text-sm font-bold text-white">{player.side}</p>
      </div>
      <div className="rounded-full border border-rose-300/40 bg-rose-400/10 px-2 py-1 text-xs font-bold text-rose-100">
        {player.flag.damage} / {player.flag.maxDamage}
      </div>
    </div>
  </div>
);

const ReservePanel = ({
  view,
  player,
  onSelect,
}: {
  view: PlayerMatchView;
  player: MatchPlayerState;
  onSelect: (unitId: UnitView["unitId"]) => void;
}) => {
  const reserves = getReserveUnitsForPlayer(view, player.id);

  return (
    <div className="rounded-2xl border border-slate-700/80 bg-slate-900/80 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          Reserve
        </p>
        <span className="text-xs text-slate-400">{player.side}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {reserves.length === 0 ? (
          <span className="text-xs text-slate-500">なし</span>
        ) : (
          reserves.map((unit) => (
            <button
              key={unit.unitId}
              type="button"
              onClick={() => onSelect(unit.unitId)}
              className="rounded-xl border border-slate-600 bg-slate-950/70 px-3 py-2 text-left text-xs text-slate-100 transition hover:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300"
            >
              <span className="font-bold">
                {unit.revealed ? unit.card.cardName : "伏せカード"}
              </span>
              <span className="block text-slate-400">{compactId(unit.unitId)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

const DetailPanel = ({ unit }: { unit: UnitView | null }) => {
  if (unit === null) {
    return (
      <section className="rounded-3xl border border-slate-700/80 bg-slate-900/80 p-4">
        <h2 className="text-lg font-bold text-white">選択ユニット</h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          自分の手番で、自分の盤面ユニットをタップするとMOVE_UNITの移動候補をサーバーから取得します。
        </p>
      </section>
    );
  }

  const detail = describeUnit(unit);

  return (
    <section className="rounded-3xl border border-cyan-300/30 bg-slate-900/90 p-4 shadow-xl shadow-cyan-950/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">選択ユニット</h2>
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
            <div className="col-span-2">
              <dt className="text-xs text-slate-500">Card</dt>
              <dd className="text-slate-100">{detail.cardName}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Stance</dt>
              <dd className="text-slate-100">{detail.stance}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Defense</dt>
              <dd className="text-slate-100">{detail.currentDefense}</dd>
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

const EventLog = ({ events }: { events: readonly LocalDebugEventLogEntry[] }) => (
  <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
    <h2 className="text-lg font-bold text-white">最新イベント</h2>
    {events.length === 0 ? (
      <p className="mt-3 text-sm text-slate-400">まだイベントはありません。</p>
    ) : (
      <ol className="mt-3 grid gap-2 text-xs text-slate-200">
        {events.map((event) => (
          <li key={event.index} className="rounded-2xl bg-slate-950/70 p-3">
            <span className="font-bold text-cyan-200">#{event.index} {event.type}</span>
            <span className="mt-1 block text-slate-300">{event.summary}</span>
          </li>
        ))}
      </ol>
    )}
  </section>
);

export default function LocalMatchDebugClient({
  initialData,
  viewerOptions,
}: LocalMatchDebugClientProps) {
  const [data, setData] = useState(initialData);
  const [selectedUnitId, setSelectedUnitId] = useState<UnitView["unitId"] | null>(null);
  const [moveStep, setMoveStep] = useState<MoveStep>("idle");
  const [candidates, setCandidates] = useState<readonly LocalDebugMoveCandidate[]>([]);
  const [selectedDestination, setSelectedDestination] = useState<LocalDebugMoveCandidate | null>(null);
  const [nextStance, setNextStance] = useState<Stance>("attack");
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
  const isViewerTurn = view.currentTurnPlayerId === view.viewerId;
  const candidatesByCoordinate = useMemo(
    () => new Map(candidates.map((candidate) => [coordinateKey(candidate.destination), candidate])),
    [candidates],
  );

  const resetSelection = () => {
    setSelectedUnitId(null);
    setMoveStep("idle");
    setCandidates([]);
    setSelectedDestination(null);
    setNextStance("attack");
  };

  const applyViewResponse = (nextData: LocalDebugViewResponse) => {
    setData(nextData);
    resetSelection();
  };

  const postJson = async <T,>(path: string, body: Record<string, unknown>): Promise<ApiResponse<T>> => {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await response.json()) as ApiResponse<T>;
  };

  const fetchMoveCandidates = (unitId: UnitView["unitId"]) => {
    setErrorMessage(null);
    startTransition(async () => {
      const response = await postJson<{ candidates: readonly LocalDebugMoveCandidate[] }>(
        "/debug/local-match/api/moves",
        { viewerSide, unitId },
      );

      if (!response.ok) {
        resetSelection();
        setErrorMessage(response.error.message);
        return;
      }

      setSelectedUnitId(unitId);
      setCandidates(response.value.candidates);
      setSelectedDestination(null);
      setMoveStep("destination");
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

  const submitMove = () => {
    if (selectedUnitId === null || selectedDestination === null) return;

    setErrorMessage(null);
    startTransition(async () => {
      const response = await postJson<LocalDebugViewResponse>(
        "/debug/local-match/api/move",
        {
          viewerSide,
          unitId: selectedUnitId,
          destination: selectedDestination.destination,
          nextStance,
          expectedStateVersion: view.stateVersion,
          actionId: `local-debug-action-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        },
      );

      if (!response.ok) {
        setErrorMessage(response.error.message);
        return;
      }

      applyViewResponse(response.value);
    });
  };

  const resetMatch = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const response = await postJson<LocalDebugViewResponse>(
        "/debug/local-match/api/reset",
        { viewerSide },
      );

      if (!response.ok) {
        setErrorMessage(response.error.message);
        return;
      }

      applyViewResponse(response.value);
    });
  };

  const handleCellClick = (unit: UnitView | null, destination: Coordinate) => {
    const candidate = candidatesByCoordinate.get(coordinateKey(destination));

    if (moveStep === "destination" && candidate !== undefined) {
      setSelectedDestination(candidate);
      setMoveStep("stance");
      return;
    }

    if (
      unit !== null &&
      unit.ownerId === view.viewerId &&
      unit.status === "board" &&
      isViewerTurn
    ) {
      fetchMoveCandidates(unit.unitId);
      return;
    }

    resetSelection();
    setSelectedUnitId(unit?.unitId ?? null);
  };

  return (
    <main className="min-h-dvh overflow-x-hidden bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 shadow-2xl shadow-black/30">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300/80">
            Debug / Local Match
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-[0.08em] text-white">
            MOVE_UNIT Debug
          </h1>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-300">
            <span>phase: {view.phase}</span>
            <span>turn: {view.turnNumber}</span>
            <span>stateVersion: {view.stateVersion}</span>
            <span>active: {currentPlayer?.side ?? "—"}</span>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-400">
            {data.stateStorageNote}
          </p>
        </header>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-3">
          <div className="grid grid-cols-2 gap-2">
            {viewerOptions.map((option) => {
              const selected = option.side === viewerSide;
              return (
                <Link
                  key={option.side}
                  href={option.href}
                  onClick={() => {
                    resetSelection();
                    refreshView(option.side);
                  }}
                  className={`rounded-2xl border px-3 py-3 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-cyan-300 ${
                    selected
                      ? "border-cyan-300 bg-cyan-300/15 text-cyan-50"
                      : "border-slate-700 bg-slate-950/60 text-slate-300"
                  }`}
                >
                  <span className="block text-xs uppercase tracking-[0.2em] text-slate-400">
                    viewer
                  </span>
                  <span className="mt-1 block font-bold">{option.side}</span>
                </Link>
              );
            })}
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-400">
            現在の視点: {viewerSide}。{isViewerTurn ? "自分の手番です。" : "相手の手番のため操作できません。"}
          </p>
        </section>

        {errorMessage !== null ? (
          <div className="rounded-2xl border border-rose-300/40 bg-rose-500/10 p-3 text-sm text-rose-100" role="alert">
            {errorMessage}
          </div>
        ) : null}

        {isPending ? (
          <div className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 p-3 text-sm text-cyan-100">
            処理中…
          </div>
        ) : null}

        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Board</h2>
            <span className="text-xs text-slate-400">
              {view.boardSize.width}×{view.boardSize.height}
            </span>
          </div>
          <div className="mb-3 flex flex-wrap gap-2 text-[0.68rem] text-slate-300">
            <span className="rounded-full border border-cyan-300/50 px-2 py-1">○ 通常移動</span>
            <span className="rounded-full border border-rose-300/50 px-2 py-1">⚔ 戦闘候補</span>
          </div>
          <div
            className="grid w-full grid-cols-8 gap-1"
            aria-label="8 by 8 local debug board"
          >
            {boardRows.flatMap((row) =>
              row.cells.map((cell) => {
                const unit = cell.unit;
                const selected = unit?.unitId === selectedUnitId;
                const candidate = candidatesByCoordinate.get(coordinateKey(cell.coordinate));
                const destinationSelected =
                  selectedDestination !== null &&
                  coordinateKey(selectedDestination.destination) === coordinateKey(cell.coordinate);
                return (
                  <button
                    key={`${cell.coordinate.row}:${cell.coordinate.col}`}
                    type="button"
                    onClick={() => handleCellClick(unit, cell.coordinate)}
                    className={`relative aspect-square min-w-0 rounded-xl border p-1 text-[0.55rem] transition focus:outline-none focus:ring-2 focus:ring-cyan-300 ${
                      destinationSelected
                        ? "border-white bg-white/15"
                        : candidate?.kind === "engage"
                          ? "border-rose-300 bg-rose-500/20"
                          : candidate?.kind === "move"
                            ? "border-cyan-300 bg-cyan-400/15"
                            : selected
                              ? "border-white bg-white/10"
                              : "border-slate-700 bg-slate-950/70 hover:border-slate-500"
                    }`}
                    aria-label={`cell ${toCoordinateLabel(cell.coordinate)}${
                      candidate === undefined
                        ? ""
                        : candidate.kind === "engage"
                          ? " combat candidate"
                          : " move candidate"
                    }`}
                  >
                    {candidate !== undefined ? (
                      <span className="absolute right-1 top-0.5 z-10 rounded-full bg-slate-950/80 px-1 text-[0.55rem] font-black text-white">
                        {candidate.kind === "engage" ? "⚔" : "○"}
                      </span>
                    ) : null}
                    {unit === null ? (
                      <span className="flex h-full items-start justify-start text-slate-600">
                        {cell.coordinate.row},{cell.coordinate.col}
                      </span>
                    ) : (
                      <UnitPill view={view} unit={unit} selected={selected} />
                    )}
                  </button>
                );
              }),
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
          <h2 className="text-lg font-bold text-white">MOVE_UNIT操作</h2>
          <div className="mt-3 grid gap-2 text-sm text-slate-300">
            <p>選択中: {selectedUnitId === null ? "—" : compactId(selectedUnitId)}</p>
            <p>候補数: 通常 {candidates.filter((candidate) => candidate.kind === "move").length} / 戦闘 {candidates.filter((candidate) => candidate.kind === "engage").length}</p>
            <p>移動先: {selectedDestination === null ? "—" : `${toCoordinateLabel(selectedDestination.destination)} (${selectedDestination.kind})`}</p>
          </div>

          {moveStep === "stance" || moveStep === "confirm" ? (
            <div className="mt-4 grid gap-3">
              <div className="grid grid-cols-2 gap-2">
                {(["attack", "defense"] as const).map((stance) => (
                  <button
                    key={stance}
                    type="button"
                    onClick={() => {
                      setNextStance(stance);
                      setMoveStep("confirm");
                    }}
                    className={`rounded-2xl border px-3 py-3 text-sm font-bold ${
                      nextStance === stance
                        ? "border-cyan-300 bg-cyan-300/15 text-cyan-50"
                        : "border-slate-700 bg-slate-950 text-slate-300"
                    }`}
                  >
                    {stance}
                  </button>
                ))}
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-3 text-xs leading-5 text-slate-300">
                {selectedUnitId === null || selectedDestination === null
                  ? "移動先を選択してください。"
                  : `${compactId(selectedUnitId)} を ${toCoordinateLabel(selectedDestination.destination)} へ ${selectedDestination.kind === "engage" ? "戦闘移動" : "通常移動"}し、${nextStance}表示にします。`}
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={resetSelection}
              className="rounded-2xl border border-slate-600 bg-slate-950 px-3 py-3 text-sm font-bold text-slate-200"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={submitMove}
              disabled={selectedUnitId === null || selectedDestination === null || isPending}
              className="rounded-2xl border border-emerald-300 bg-emerald-400/20 px-3 py-3 text-sm font-bold text-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              確認して実行
            </button>
          </div>
        </section>

        <section className="grid gap-3">
          {view.players.map((player) => (
            <div key={player.id} className="grid gap-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs text-slate-400">
                {formatPlayerLabel(player)} / viewer side: {getPlayerSide(view, player.id)}
              </div>
              <FlagPanel player={player} />
              <ReservePanel
                view={view}
                player={player}
                onSelect={(unitId) => {
                  resetSelection();
                  setSelectedUnitId(unitId);
                }}
              />
            </div>
          ))}
        </section>

        <DetailPanel unit={selectedUnit} />
        <EventLog events={data.events} />

        <button
          type="button"
          onClick={resetMatch}
          className="mb-4 rounded-3xl border border-rose-300/50 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-100"
        >
          fixture初期状態へリセット
        </button>
      </div>
    </main>
  );
}
