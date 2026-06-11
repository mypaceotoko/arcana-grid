import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";

import { submitLocalDebugMoveUnit } from "../../harness";
import {
  isDebugApiEnabled,
  jsonError,
  jsonResult,
  makeInvalidRequestError,
  parseActionId,
  parseCoordinate,
  parseExpectedStateVersion,
  parseStance,
  parseUnitId,
  parseViewerSide,
} from "../common";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isDebugApiEnabled()) notFound();

  const body = (await request.json()) as Record<string, unknown>;
  const unitId = parseUnitId(body.unitId);
  const destination = parseCoordinate(body.destination);
  const nextStance = parseStance(body.nextStance);
  const expectedStateVersion = parseExpectedStateVersion(body.expectedStateVersion);

  if (
    unitId === null ||
    destination === null ||
    nextStance === null ||
    expectedStateVersion === null
  ) {
    return jsonError(
      makeInvalidRequestError("unitId, destination, nextStance, and expectedStateVersion are required."),
    );
  }

  const result = submitLocalDebugMoveUnit({
    viewerSide: parseViewerSide(body.viewerSide),
    unitId,
    destination,
    nextStance,
    expectedStateVersion,
    actionId: parseActionId(body.actionId),
  });

  if (!result.ok) return jsonError(result.error);
  return jsonResult(result.value);
}
