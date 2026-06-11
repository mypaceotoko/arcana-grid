import { NextResponse } from "next/server";

import type { Coordinate, PlayerSide, RuleError, Stance, UnitId } from "@/game";
import { toActionId, toUnitId } from "@/game";

export const isDebugApiEnabled = (): boolean =>
  process.env.NODE_ENV !== "production" ||
  process.env.ENABLE_DEBUG_PAGES === "true";

export const parseViewerSide = (value: unknown): PlayerSide =>
  value === "north" ? "north" : "south";

export const jsonError = (error: RuleError, status = 400) =>
  NextResponse.json({ ok: false, error }, { status });

export const jsonResult = <T>(value: T) => NextResponse.json({ ok: true, value });

export const parseUnitId = (value: unknown): UnitId | null =>
  typeof value === "string" && value.length > 0 ? toUnitId(value) : null;

export const parseActionId = (value: unknown) =>
  typeof value === "string" && value.length > 0
    ? toActionId(value)
    : toActionId(`local-debug-action-${Date.now()}`);

export const parseCoordinate = (value: unknown): Coordinate | null => {
  if (typeof value !== "object" || value === null) return null;

  const candidate = value as { row?: unknown; col?: unknown };
  if (!Number.isInteger(candidate.row) || !Number.isInteger(candidate.col)) {
    return null;
  }

  return { row: candidate.row as number, col: candidate.col as number };
};

export const parseStance = (value: unknown): Stance | null =>
  value === "attack" || value === "defense" ? value : null;

export const parseExpectedStateVersion = (value: unknown): number | null =>
  Number.isInteger(value) ? (value as number) : null;

export const makeInvalidRequestError = (
  message: string,
  details?: Record<string, unknown>,
): RuleError => ({
  code: "INVALID_ACTION",
  message,
  details,
});
