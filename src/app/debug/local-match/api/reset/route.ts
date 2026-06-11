import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";

import { resetLocalDebugMatch } from "../../harness";
import { isDebugApiEnabled, jsonError, jsonResult, parseViewerSide } from "../common";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isDebugApiEnabled()) notFound();

  const body = (await request.json()) as Record<string, unknown>;
  const fixture = body.fixture === "active" ? "active" : "setup";
  const result = resetLocalDebugMatch(parseViewerSide(body.viewerSide), fixture);

  if (!result.ok) return jsonError(result.error);
  return jsonResult(result.value);
}
