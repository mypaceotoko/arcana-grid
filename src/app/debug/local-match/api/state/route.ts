import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";

import { getLocalDebugMatchView } from "../../harness";
import { isDebugApiEnabled, jsonError, jsonResult, parseViewerSide } from "../common";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  if (!isDebugApiEnabled()) notFound();

  const viewerSide = parseViewerSide(request.nextUrl.searchParams.get("viewer"));
  const result = getLocalDebugMatchView(viewerSide);

  if (!result.ok) return jsonError(result.error);
  return jsonResult(result.value);
}
