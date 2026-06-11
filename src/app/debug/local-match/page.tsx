import { notFound } from "next/navigation";

import { buildPlayerMatchView } from "@/game";
import type { PlayerSide } from "@/game";

import LocalMatchDebugClient from "./ui";
import {
  LOCAL_DEBUG_CARD_BACK_KEY,
  LOCAL_DEBUG_MATCH_PLAYER_IDS,
  localDebugMatchState,
} from "./fixture";

export const dynamic = "force-dynamic";

type LocalMatchDebugPageProps = {
  searchParams?: Promise<{
    viewer?: string;
  }>;
};

const isDebugPageEnabled = (): boolean =>
  process.env.NODE_ENV !== "production" ||
  process.env.ENABLE_DEBUG_PAGES === "true";

const parseViewerSide = (viewer: string | undefined): PlayerSide =>
  viewer === "north" ? "north" : "south";

export default async function LocalMatchDebugPage({
  searchParams,
}: LocalMatchDebugPageProps) {
  if (!isDebugPageEnabled()) {
    notFound();
  }

  const params = await searchParams;
  const viewerSide = parseViewerSide(params?.viewer);
  const viewerId = LOCAL_DEBUG_MATCH_PLAYER_IDS[viewerSide];
  const view = buildPlayerMatchView({
    state: localDebugMatchState,
    viewerId,
    cardBackKey: LOCAL_DEBUG_CARD_BACK_KEY,
  });

  if (!view.ok) {
    throw new Error("Failed to build local debug player view.");
  }

  return (
    <LocalMatchDebugClient
      view={view.value}
      viewerOptions={[
        { side: "south", href: "/debug/local-match?viewer=south" },
        { side: "north", href: "/debug/local-match?viewer=north" },
      ]}
    />
  );
}
