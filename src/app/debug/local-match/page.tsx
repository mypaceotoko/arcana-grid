import { notFound } from "next/navigation";

import type { PlayerSide } from "@/game";

import { getLocalDebugMatchView } from "./harness";
import LocalMatchDebugClient from "./ui";

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
  const response = getLocalDebugMatchView(viewerSide);

  if (!response.ok) {
    throw new Error("Failed to build local debug player view.");
  }

  return (
    <LocalMatchDebugClient
      initialData={response.value}
      viewerOptions={[
        { side: "south", href: "/debug/local-match?viewer=south" },
        { side: "north", href: "/debug/local-match?viewer=north" },
      ]}
    />
  );
}
