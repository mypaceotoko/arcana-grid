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
type ActionStep = "idle" | "destination" | "stance" | "confirm";
type BoardCandidate =
  | LocalDebugMoveCandidate
  | (LocalDebugReserveCandidate & { kind: "deploy" })
  | LocalDebugFlagAttackCandidate;

const formatPlayerLabel = (player: MatchPlayerState): string =>
  `${player.side} / ${player.id}`;

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
      ? "border-cyan-300/70 bg-cyan-400/15 text-cyan-100"
      : "border-fuchsia-300/70 bg-fuchsia-500/15 text-fuchsia-100";
  }

  return own
    ? "border-emerald-300/80 bg-emerald-400/20 text-emerald-50"
    : "border-amber-300/80 bg-amber-400/20 text-amber-50";
};

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
      return "border-cyan-300 bg-cyan-400/15";
    case "engage":
      return "border-rose-300 bg-rose-500/20";
    case "deploy":
      return "border-emerald-300 bg-emerald-400/20";
    case "flag_attack":
      return "border-amber-200 bg-amber-400/25";
    default:
      return "border-slate-700 bg-slate-950/70 hover:border-slate-500";
  }
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
        damage {player.flag.damage} / {player.flag.maxDamage}
      </div>
    </div>
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
          {player.side} / {ownsPanel ? "自分" : "相手（選択不可）"}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
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
                className={`rounded-xl border px-3 py-2 text-left text-xs transition focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-50 ${
                  selected
                    ? "border-emerald-300 bg-emerald-400/20 text-emerald-50"
                    : "border-slate-600 bg-slate-950/70 text-slate-100 hover:border-cyan-300"
                }`}
                aria-label={`${ownsPanel ? "own" : "opponent"} reserve ${compactId(unit.unitId)}`}
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
        <h2 className="text-lg font-bold text-white">選択ユニット</h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          自分の盤面ユニットでMOVE_UNIT/ATTACK_FLAG、自分のリザーバーでDEPLOY_RESERVEをサーバーハーネスへ問い合わせます。
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
            <span className="font-bold text-cyan-200">
              #{event.index} {event.type}
            </span>
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
  const [actionMode, setActionMode] = useState<ActionMode>("none");
  const [actionStep, setActionStep] = useState<ActionStep>("idle");
  const [candidates, setCandidates] = useState<readonly BoardCandidate[]>([]);
  const [selectedDestination, setSelectedDestination] = useState<BoardCandidate | null>(null);
  const [nextStance, setNextStance] = useState<Stance>("attack");
  const [setupSelectedUnitId, setSetupSelectedUnitId] = useState<string | null>(null);
  const [setupPlacements, setSetupPlacements] = useState<readonly SetupDraftPlacement[]>([]);
  const [setupReserveUnitIds, setSetupReserveUnitIds] = useState<readonly string[]>([]);
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
  const opponentPlayer = view.players.find((player) => player.id !== view.viewerId);
  const isSetupPhase = view.phase === "setup";
  const setupSubmitted = viewerPlayer?.setupSubmitted ?? false;
  const opponentSetupSubmitted = opponentPlayer?.setupSubmitted ?? false;
  const ownSetupUnits = isSetupPhase
    ? view.units.filter((unit) => unit.ownerId === view.viewerId)
    : [];
  const setupPlacementByUnitId = useMemo(
    () => new Map(setupPlacements.map((placement) => [placement.unitId, placement])),
    [setupPlacements],
  );
  const setupReserveIdSet = useMemo(
    () => new Set(setupReserveUnitIds),
    [setupReserveUnitIds],
  );
  const setupLegalCoordinateKeys = useMemo(
    () => new Set(data.setup.legalPlacementCoordinates.map(coordinateKey)),
    [data.setup.legalPlacementCoordinates],
  );
  const setupOccupiedCoordinateKeys = useMemo(
    () => new Set(setupPlacements.map((placement) => coordinateKey(placement.position))),
    [setupPlacements],
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

  const resetSelection = () => {
    setSelectedUnitId(null);
    setActionMode("none");
    setActionStep("idle");
    setCandidates([]);
    setSelectedDestination(null);
    setNextStance("attack");
  };

  const resetSetupDraft = () => {
    setSetupSelectedUnitId(null);
    setSetupPlacements([]);
    setSetupReserveUnitIds([]);
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
    if (!isSetupPhase || setupSubmitted || isPending) return;
    setSetupSelectedUnitId(unitId);
  };

  const toggleSetupReserve = (unitId: string) => {
    if (!isSetupPhase || setupSubmitted || isPending) return;
    setSetupReserveUnitIds((previous) => {
      const exists = previous.includes(unitId);
      if (exists) return previous.filter((id) => id !== unitId);
      if (previous.length >= 2) return previous;
      return [...previous, unitId];
    });
    setSetupPlacements((previous) => previous.filter((placement) => placement.unitId !== unitId));
    setSetupSelectedUnitId(unitId);
  };

  const updateSetupStance = (unitId: string, stance: Stance) => {
    setSetupPlacements((previous) =>
      previous.map((placement) =>
        placement.unitId === unitId ? { ...placement, stance } : placement,
      ),
    );
  };

  const clearSetupPlacement = (unitId: string) => {
    setSetupPlacements((previous) => previous.filter((placement) => placement.unitId !== unitId));
    setSetupSelectedUnitId(unitId);
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
          reserveUnitIds: setupReserveUnitIds,
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
      if (setupSelectedUnitId === null || setupReserveIdSet.has(setupSelectedUnitId) || setupSubmitted) return;
      const destinationKey = coordinateKey(destination);
      const occupiedByOther = setupPlacements.some(
        (placement) => placement.unitId !== setupSelectedUnitId && coordinateKey(placement.position) === destinationKey,
      );
      if (!setupLegalCoordinateKeys.has(destinationKey) || occupiedByOther) return;
      setSetupPlacements((previous) => [
        ...previous.filter((placement) => placement.unitId !== setupSelectedUnitId),
        { unitId: setupSelectedUnitId, position: destination, stance: setupPlacementByUnitId.get(setupSelectedUnitId)?.stance ?? "attack" },
      ]);
      setSetupReserveUnitIds((previous) => previous.filter((id) => id !== setupSelectedUnitId));
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
      return "候補マスを選択してください。";
    }

    return `${selectedDestination.kind === "flag_attack" ? "ATTACK_FLAG" : selectedDestination.kind === "deploy" ? "DEPLOY_RESERVE" : "MOVE_UNIT"}: ${compactId(selectedUnitId)} → ${toCoordinateLabel(selectedDestination.destination)} (${candidateLabel(selectedDestination)}) / ${nextStance}表示`;
  };

  return (
    <main className="min-h-dvh overflow-x-hidden bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 shadow-2xl shadow-black/30">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300/80">
            Debug / Local Match
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-[0.08em] text-white">
            Local Actions Debug
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

        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
          <h2 className="text-lg font-bold text-white">勝敗結果</h2>
          {view.phase === "finished" ? (
            <div className="mt-3 rounded-2xl border border-amber-300/40 bg-amber-400/10 p-3 text-sm text-amber-50">
              winner: {winner?.side ?? "—"} / reason: {view.winReason ?? "—"}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-400">対戦中です。</p>
          )}
        </section>

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
            現在の視点: {viewerSide}。{isFinished ? "勝敗確定後のため盤面操作は停止しています。" : isViewerTurn ? "自分の手番です。" : "相手の手番です。投了のみ実行できます。"}
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

        {isSetupPhase ? (
          <section className="rounded-3xl border border-cyan-300/30 bg-cyan-400/10 p-4">
            <h2 className="text-lg font-bold text-cyan-50">初期配置</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-200">
              <span className="rounded-2xl border border-slate-700 bg-slate-950/70 p-2">自分: {setupSubmitted ? "準備完了" : "未提出"}</span>
              <span className="rounded-2xl border border-slate-700 bg-slate-950/70 p-2">相手: {opponentSetupSubmitted ? "準備完了" : "未完了"}</span>
              <span className="rounded-2xl border border-slate-700 bg-slate-950/70 p-2">配置: {setupPlacements.length} / 6</span>
              <span className="rounded-2xl border border-slate-700 bg-slate-950/70 p-2">リザーブ: {setupReserveUnitIds.length} / 2</span>
            </div>
            {setupSubmitted ? (
              <p className="mt-3 rounded-2xl border border-emerald-300/40 bg-emerald-400/10 p-3 text-sm text-emerald-50">
                提出済みです。再提出はできません。相手の具体的な配置・リザーバーは表示しません。
              </p>
            ) : null}
            <p className="mt-3 text-xs leading-5 text-cyan-100/80">
              自分の8体から6体を自陣2列の合法マスへ仮配置し、2体をリザーバー予定にしてください。旗エリアと重複マスはサーバーreducerでも再検証されます。
            </p>
            <div className="mt-4 grid gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">未配置カード一覧</h3>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {ownSetupUnits
                    .filter((unit) => !setupPlacementByUnitId.has(unit.unitId) && !setupReserveIdSet.has(unit.unitId))
                    .map((unit) => (
                      <button
                        key={unit.unitId}
                        type="button"
                        disabled={setupSubmitted || isPending}
                        onClick={() => selectSetupUnit(unit.unitId)}
                        className={`rounded-2xl border px-3 py-2 text-left text-xs ${setupSelectedUnitId === unit.unitId ? "border-cyan-200 bg-cyan-300/20" : "border-slate-700 bg-slate-950/80"}`}
                      >
                        <span className="block font-bold text-white">{unit.revealed ? unit.card.cardName : compactId(unit.unitId)}</span>
                        <span className="text-slate-400">{compactId(unit.unitId)}</span>
                      </button>
                    ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">仮配置済みカード</h3>
                <div className="mt-2 grid gap-2">
                  {setupPlacements.length === 0 ? <p className="text-xs text-slate-400">なし</p> : setupPlacements.map((placement) => {
                    const unit = ownSetupUnits.find((candidate) => candidate.unitId === placement.unitId);
                    return (
                      <div key={placement.unitId} className="rounded-2xl border border-slate-700 bg-slate-950/80 p-3 text-xs">
                        <button type="button" onClick={() => selectSetupUnit(placement.unitId)} className="font-bold text-cyan-100">
                          {unit?.revealed ? unit.card.cardName : compactId(placement.unitId)} / {toCoordinateLabel(placement.position)}
                        </button>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          {(["attack", "defense"] as const).map((stance) => (
                            <button key={stance} type="button" onClick={() => updateSetupStance(placement.unitId, stance)} className={`rounded-xl border px-2 py-2 font-bold ${placement.stance === stance ? "border-cyan-200 bg-cyan-300/20 text-cyan-50" : "border-slate-700 text-slate-300"}`}>{stance}</button>
                          ))}
                          <button type="button" onClick={() => clearSetupPlacement(placement.unitId)} className="rounded-xl border border-rose-300/50 px-2 py-2 font-bold text-rose-100">解除</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">リザーバー予定カード</h3>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {ownSetupUnits.map((unit) => (
                    <button
                      key={`reserve-${unit.unitId}`}
                      type="button"
                      disabled={setupSubmitted || isPending || (!setupReserveIdSet.has(unit.unitId) && setupReserveUnitIds.length >= 2)}
                      onClick={() => toggleSetupReserve(unit.unitId)}
                      className={`rounded-2xl border px-3 py-2 text-left text-xs disabled:opacity-40 ${setupReserveIdSet.has(unit.unitId) ? "border-emerald-200 bg-emerald-300/20 text-emerald-50" : "border-slate-700 bg-slate-950/80 text-slate-300"}`}
                    >
                      {unit.revealed ? unit.card.cardName : compactId(unit.unitId)}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                disabled={setupSubmitted || isPending || setupPlacements.length !== 6 || setupReserveUnitIds.length !== 2}
                onClick={submitSetupPlacement}
                className="rounded-2xl border border-emerald-300 bg-emerald-400/20 px-3 py-3 text-sm font-bold text-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                SUBMIT_INITIAL_PLACEMENTを提出
              </button>
              {!setupSubmitted && (setupPlacements.length !== 6 || setupReserveUnitIds.length !== 2) ? (
                <p className="text-xs text-slate-400">6体配置・2体リザーブを満たすと提出できます。</p>
              ) : null}
              {setupSubmitted && !opponentSetupSubmitted ? (
                <p className="text-xs text-slate-300">相手の準備完了を待っています。</p>
              ) : null}
            </div>
          </section>
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
            <span className="rounded-full border border-emerald-300/50 px-2 py-1">配 リザーバー配置</span>
            <span className="rounded-full border border-amber-200/60 px-2 py-1">旗 旗攻撃</span>
          </div>
          <div
            className="grid w-full grid-cols-8 gap-1"
            aria-label="8 by 8 local debug board"
          >
            {boardRows.flatMap((row) =>
              row.cells.map((cell) => {
                const setupDraft = setupPlacements.find((placement) => coordinateKey(placement.position) === coordinateKey(cell.coordinate));
                const setupDraftUnit = setupDraft === undefined ? null : ownSetupUnits.find((unit) => unit.unitId === setupDraft.unitId) ?? null;
                const unit = isSetupPhase ? setupDraftUnit : cell.unit;
                const setupLegal = isSetupPhase && setupSelectedUnitId !== null && !setupReserveIdSet.has(setupSelectedUnitId) && setupLegalCoordinateKeys.has(coordinateKey(cell.coordinate)) && (!setupOccupiedCoordinateKeys.has(coordinateKey(cell.coordinate)) || setupDraft?.unitId === setupSelectedUnitId);
                const selected = unit?.unitId === selectedUnitId || setupDraft?.unitId === setupSelectedUnitId;
                const candidate = candidatesByCoordinate.get(coordinateKey(cell.coordinate));
                const destinationSelected =
                  selectedDestination !== null &&
                  coordinateKey(selectedDestination.destination) === coordinateKey(cell.coordinate);
                return (
                  <button
                    key={`${cell.coordinate.row}:${cell.coordinate.col}`}
                    type="button"
                    onClick={() => handleCellClick(unit, cell.coordinate)}
                    disabled={isFinished}
                    className={`relative aspect-square min-w-0 rounded-xl border p-1 text-[0.55rem] transition focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-70 ${
                      destinationSelected
                        ? "border-white bg-white/15"
                        : selected
                          ? "border-white bg-white/10"
                          : setupLegal
                            ? "border-cyan-300 bg-cyan-400/15"
                            : candidateClasses(candidate)
                    }`}
                    aria-label={`cell ${toCoordinateLabel(cell.coordinate)}${
                      candidate === undefined ? "" : ` ${candidateLabel(candidate)}`
                    }`}
                  >
                    {candidate !== undefined ? (
                      <span className="absolute right-1 top-0.5 z-10 rounded-full bg-slate-950/80 px-1 text-[0.55rem] font-black text-white">
                        {candidateMarker(candidate)}
                      </span>
                    ) : null}
                    {setupLegal ? (
                      <span className="absolute right-1 top-1 text-[0.6rem] font-bold text-cyan-100">初</span>
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
          <h2 className="text-lg font-bold text-white">操作確認</h2>
          <div className="mt-3 grid gap-2 text-sm text-slate-300">
            <p>操作: {actionMode === "none" ? "—" : actionMode}</p>
            <p>選択中: {selectedUnitId === null ? "—" : compactId(selectedUnitId)}</p>
            <p>
              候補数: 通常 {candidates.filter((candidate) => candidate.kind === "move").length} / 戦闘 {candidates.filter((candidate) => candidate.kind === "engage").length} / 配置 {candidates.filter((candidate) => candidate.kind === "deploy").length} / 旗攻撃 {candidates.filter((candidate) => candidate.kind === "flag_attack").length}
            </p>
            <p>
              対象: {selectedDestination === null ? "—" : `${toCoordinateLabel(selectedDestination.destination)} (${candidateLabel(selectedDestination)})`}
            </p>
          </div>

          {actionStep === "stance" || actionStep === "confirm" ? (
            <div className="mt-4 grid gap-3">
              <div className="grid grid-cols-2 gap-2">
                {(["attack", "defense"] as const).map((stance) => (
                  <button
                    key={stance}
                    type="button"
                    onClick={() => {
                      setNextStance(stance);
                      setActionStep("confirm");
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
            </div>
          ) : null}

          <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-950/70 p-3 text-xs leading-5 text-slate-300">
            {confirmationText()}
          </div>

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
              onClick={submitSelectedAction}
              disabled={
                isPending ||
                (actionMode !== "concede" &&
                  (selectedUnitId === null || selectedDestination === null || actionStep !== "confirm"))
              }
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
                selectedUnitId={selectedUnitId}
                disabled={!canStartTurnAction}
                onSelect={fetchReserveCandidates}
              />
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-rose-300/30 bg-rose-500/10 p-4">
          <h2 className="text-lg font-bold text-rose-50">投了</h2>
          <p className="mt-2 text-xs leading-5 text-rose-100/80">
            activeフェーズなら自分の手番以外でもCONCEDE_MATCHを送信できます。確認後、相手が勝者になります。
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
              className="rounded-2xl border border-rose-300/60 bg-rose-400/15 px-3 py-3 text-sm font-bold text-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              投了確認を開く
            </button>
            <button
              type="button"
              disabled={actionMode !== "concede" || isPending}
              onClick={submitSelectedAction}
              className="rounded-2xl border border-rose-200 bg-rose-500/25 px-3 py-3 text-sm font-bold text-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              CONCEDE_MATCH実行
            </button>
          </div>
        </section>

        <DetailPanel unit={selectedUnit} />
        <EventLog events={data.events} />

        <section className="mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => resetMatch("setup")}
            className="rounded-3xl border border-cyan-300/50 bg-cyan-500/10 px-4 py-3 text-sm font-bold text-cyan-100"
          >
            setup開始へリセット
          </button>
          <button
            type="button"
            onClick={() => resetMatch("active")}
            className="rounded-3xl border border-rose-300/50 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-100"
          >
            activeデバッグへリセット
          </button>
        </section>
      </div>
    </main>
  );
}
