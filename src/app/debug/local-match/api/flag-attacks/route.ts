import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";

import { getLocalDebugFlagAttackCandidates } from "../../harness";
import {
  isDebugApiEnabled,
  jsonError,
  jsonResult,
  makeInvalidRequestError,
  parseUnitId,
  parseViewerSide,
} from "../common";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isDebugApiEnabled()) notFound();

  const body = (await request.json()) as Record<string, unknown>;
  const unitId = parseUnitId(body.unitId);

  if (unitId === null) {
    return jsonError(makeInvalidRequestError("unitId is required."));
  }

  const result = getLocalDebugFlagAttackCandidates({
    viewerSide: parseViewerSide(body.viewerSide),
    unitId,
  });

  if (!result.ok) return jsonError(result.error);
  return jsonResult(result.value);
}
