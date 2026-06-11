import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";

import {
  submitLocalDebugAttackFlag,
  submitLocalDebugConcedeMatch,
  submitLocalDebugDeployReserve,
  submitLocalDebugMoveUnit,
} from "../../harness";
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
  const actionType = body.actionType;
  const expectedStateVersion = parseExpectedStateVersion(body.expectedStateVersion);

  if (expectedStateVersion === null) {
    return jsonError(makeInvalidRequestError("expectedStateVersion is required."));
  }

  if (actionType === "CONCEDE_MATCH") {
    const result = submitLocalDebugConcedeMatch({
      viewerSide: parseViewerSide(body.viewerSide),
      expectedStateVersion,
      actionId: parseActionId(body.actionId),
    });

    if (!result.ok) return jsonError(result.error);
    return jsonResult(result.value);
  }

  const unitId = parseUnitId(body.unitId);
  const nextStance = parseStance(body.nextStance ?? body.stance);

  if (unitId === null || nextStance === null) {
    return jsonError(makeInvalidRequestError("unitId and stance are required."));
  }

  if (actionType === "MOVE_UNIT") {
    const destination = parseCoordinate(body.destination);
    if (destination === null) {
      return jsonError(makeInvalidRequestError("destination is required."));
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

  if (actionType === "DEPLOY_RESERVE") {
    const destination = parseCoordinate(body.destination);
    if (destination === null) {
      return jsonError(makeInvalidRequestError("destination is required."));
    }

    const result = submitLocalDebugDeployReserve({
      viewerSide: parseViewerSide(body.viewerSide),
      unitId,
      destination,
      stance: nextStance,
      expectedStateVersion,
      actionId: parseActionId(body.actionId),
    });

    if (!result.ok) return jsonError(result.error);
    return jsonResult(result.value);
  }

  if (actionType === "ATTACK_FLAG") {
    const target = parseCoordinate(body.target);
    if (target === null) {
      return jsonError(makeInvalidRequestError("target is required."));
    }

    const result = submitLocalDebugAttackFlag({
      viewerSide: parseViewerSide(body.viewerSide),
      unitId,
      target,
      nextStance,
      expectedStateVersion,
      actionId: parseActionId(body.actionId),
    });

    if (!result.ok) return jsonError(result.error);
    return jsonResult(result.value);
  }

  return jsonError(makeInvalidRequestError("Unsupported actionType.", { actionType }));
}
