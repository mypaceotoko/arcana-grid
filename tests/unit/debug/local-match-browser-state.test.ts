import { describe, expect, it } from "vitest";

import { TACTICAL_DUEL_RULES_VERSION, toActionId, toUnitId } from "../../../src/game";
import {
  LOCAL_DEBUG_BROWSER_STORAGE_KEY,
  createLocalDebugBrowserHarness,
} from "../../../src/app/debug/local-match/browser-state";
import { LOCAL_DEBUG_MATCH_PLAYER_IDS, localDebugMatchState } from "../../../src/app/debug/local-match/fixture";
import type { Result, RuleError } from "../../../src/game";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const unwrap = <T>(result: Result<T, RuleError>): T => {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

const expectErrorCode = <T>(result: Result<T, RuleError>, code: RuleError["code"]): RuleError => {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Expected error result.");
  expect(result.error.code).toBe(code);
  return result.error;
};

const actionId = (name: string) => toActionId(`local-debug-browser-${name}`);
const unitId = (value: string) => toUnitId(value);
const setupUnitId = (side: "north" | "south", index: number) =>
  unitId(`local-debug-${side}-setup-${index}`);
const placements = (side: "north" | "south") => {
  const row = side === "north" ? 0 : 6;
  return [0, 1, 2, 5, 6, 7].map((col, index) => ({
    unitId: setupUnitId(side, index + 1),
    position: { row, col },
    stance: index % 2 === 0 ? "attack" as const : "defense" as const,
  }));
};
const reserves = (side: "north" | "south") => [setupUnitId(side, 7), setupUnitId(side, 8)];

describe("local debug browser state harness", () => {
  it("initializes from setup fixture when storage is empty and writes a versioned payload", () => {
    const storage = new MemoryStorage();
    const harness = createLocalDebugBrowserHarness(storage, "south");
    const response = unwrap(harness.getView());
    const saved = JSON.parse(storage.getItem(LOCAL_DEBUG_BROWSER_STORAGE_KEY) ?? "null") as Record<string, unknown>;

    expect(response.view.phase).toBe("setup");
    expect(response.stateStorageNote).toContain("ブラウザ内デバッグ保存");
    expect(saved.version).toBe(1);
    expect((saved.state as { rulesVersion: string }).rulesVersion).toBe(TACTICAL_DUEL_RULES_VERSION);
    expect((saved.flow as { viewerSide: string }).viewerSide).toBe("south");
  });

  it("persists player 1 setup, restores it after reload, then starts active after player 2 setup", () => {
    const storage = new MemoryStorage();
    const harness = createLocalDebugBrowserHarness(storage, "south");
    const southSubmitted = unwrap(harness.submitInitialPlacement({
      viewerSide: "south",
      placements: placements("south"),
      reserveUnitIds: reserves("south"),
      expectedStateVersion: 1,
      actionId: actionId("south-setup"),
    }));

    expect(southSubmitted.view.phase).toBe("setup");
    expect(southSubmitted.view.players.find((player) => player.id === LOCAL_DEBUG_MATCH_PLAYER_IDS.south)?.setupSubmitted).toBe(true);

    const reloaded = createLocalDebugBrowserHarness(storage, "south");
    const restored = unwrap(reloaded.getView("south"));
    expect(restored.view.stateVersion).toBe(southSubmitted.view.stateVersion);
    expect(restored.events.map((event) => event.type)).toContain("INITIAL_PLACEMENT_SUBMITTED");
    expect(JSON.stringify(restored)).not.toContain("South Setup");

    reloaded.setFirstPlayerRandomSourceForTests(() => 1);
    const started = unwrap(reloaded.submitInitialPlacement({
      viewerSide: "north",
      placements: placements("north"),
      reserveUnitIds: reserves("north"),
      expectedStateVersion: restored.view.stateVersion,
      actionId: actionId("north-setup"),
    }));

    expect(started.view.phase).toBe("active");
    expect(started.view.currentTurnPlayerId).toBe(LOCAL_DEBUG_MATCH_PLAYER_IDS.south);
    expect(started.events.map((event) => event.type)).toContain("MATCH_STARTED");

    const activeReload = createLocalDebugBrowserHarness(storage, "south");
    const activeRestored = unwrap(activeReload.getView());
    expect(activeRestored.view.phase).toBe("active");
    expect(activeRestored.view.stateVersion).toBe(started.view.stateVersion);
  });

  it("restores active move, combat defense changes, reserve deployment, flag damage, and concession", () => {
    const storage = new MemoryStorage();
    const harness = createLocalDebugBrowserHarness(storage, "south");
    let response = unwrap(harness.reset("south", "active"));

    response = unwrap(harness.submitMoveUnit({
      viewerSide: "south",
      unitId: unitId("local-debug-south-bolt"),
      destination: { row: 3, col: 4 },
      nextStance: "attack",
      expectedStateVersion: response.view.stateVersion,
      actionId: actionId("combat"),
    }));
    let restored = unwrap(createLocalDebugBrowserHarness(storage, "north").getView());
    const defender = restored.view.units.find((unit) => unit.unitId === unitId("local-debug-north-revealed-oracle"));
    expect(defender?.revealed).toBe(true);
    if (defender?.revealed) expect(defender.currentDefense).toBeLessThan(defender.card.baseDefense);
    expect(restored.view.currentTurnPlayerId).toBe(LOCAL_DEBUG_MATCH_PLAYER_IDS.north);
    expect(restored.events.map((event) => event.type)).toContain("DEFENSE_CHANGED");

    const northHarness = createLocalDebugBrowserHarness(storage, "north");
    const deployDestination = unwrap(northHarness.getReserveDeploymentCandidates({
      viewerSide: "north",
      unitId: unitId("local-debug-north-reserve"),
    })).candidates[0]?.destination;
    if (deployDestination === undefined) throw new Error("missing deployment candidate");
    response = unwrap(northHarness.submitDeployReserve({
      viewerSide: "north",
      unitId: unitId("local-debug-north-reserve"),
      destination: deployDestination,
      stance: "defense",
      expectedStateVersion: response.view.stateVersion,
      actionId: actionId("deploy"),
    }));
    restored = unwrap(createLocalDebugBrowserHarness(storage, "south").getView());
    expect(restored.view.units.find((unit) => unit.unitId === unitId("local-debug-north-reserve"))?.position).toEqual(deployDestination);

    response = unwrap(createLocalDebugBrowserHarness(storage, "south").reset("south", "active"));
    response = unwrap(createLocalDebugBrowserHarness(storage, "south").submitAttackFlag({
      viewerSide: "south",
      unitId: unitId("local-debug-south-flag-runner"),
      target: { row: 0, col: 3 },
      nextStance: "defense",
      expectedStateVersion: response.view.stateVersion,
      actionId: actionId("flag"),
    }));
    restored = unwrap(createLocalDebugBrowserHarness(storage, "south").getView());
    expect(restored.view.players.find((player) => player.id === LOCAL_DEBUG_MATCH_PLAYER_IDS.north)?.flag.damage).toBe(3);
    expect(restored.view.phase).toBe("finished");

    response = unwrap(createLocalDebugBrowserHarness(storage, "south").reset("south", "active"));
    response = unwrap(createLocalDebugBrowserHarness(storage, "south").submitConcedeMatch({
      viewerSide: "south",
      expectedStateVersion: response.view.stateVersion,
      actionId: actionId("concede"),
    }));
    restored = unwrap(createLocalDebugBrowserHarness(storage, "south").getView());
    expect(restored.view.phase).toBe("finished");
    expect(restored.view.winReason).toBe("concession");
    expect(restored.view.stateVersion).toBe(response.view.stateVersion);
  });

  it("rejects stale actions and reducer failures without overwriting persisted state", () => {
    const storage = new MemoryStorage();
    const harness = createLocalDebugBrowserHarness(storage, "south");
    const active = unwrap(harness.reset("south", "active"));
    const before = storage.getItem(LOCAL_DEBUG_BROWSER_STORAGE_KEY);

    expectErrorCode(harness.submitMoveUnit({
      viewerSide: "south",
      unitId: unitId("local-debug-south-aegis"),
      destination: { row: 5, col: 3 },
      nextStance: "attack",
      expectedStateVersion: active.view.stateVersion - 1,
      actionId: actionId("stale"),
    }), "STALE_STATE_VERSION");
    expect(storage.getItem(LOCAL_DEBUG_BROWSER_STORAGE_KEY)).toBe(before);

    expectErrorCode(harness.submitMoveUnit({
      viewerSide: "south",
      unitId: unitId("local-debug-south-aegis"),
      destination: { row: 2, col: 4 },
      nextStance: "attack",
      expectedStateVersion: active.view.stateVersion,
      actionId: actionId("illegal"),
    }), "DESTINATION_NOT_LEGAL");
    expect(storage.getItem(LOCAL_DEBUG_BROWSER_STORAGE_KEY)).toBe(before);
  });

  it("safely discards broken JSON, rulesVersion mismatch, and clears storage on complete reset", () => {
    const storage = new MemoryStorage();
    storage.setItem(LOCAL_DEBUG_BROWSER_STORAGE_KEY, "{broken");
    expect(unwrap(createLocalDebugBrowserHarness(storage, "south").getView()).view.phase).toBe("setup");

    const saved = JSON.parse(storage.getItem(LOCAL_DEBUG_BROWSER_STORAGE_KEY) ?? "null") as Record<string, unknown>;
    storage.setItem(LOCAL_DEBUG_BROWSER_STORAGE_KEY, JSON.stringify({
      ...saved,
      state: { ...(saved.state as Record<string, unknown>), rulesVersion: "old" },
    }));
    expect(unwrap(createLocalDebugBrowserHarness(storage, "south").getView()).view.phase).toBe("setup");

    const harness = createLocalDebugBrowserHarness(storage, "south");
    unwrap(harness.reset("south", "active"));
    expect(storage.getItem(LOCAL_DEBUG_BROWSER_STORAGE_KEY)).not.toBeNull();
    const cleared = unwrap(harness.clear("south"));
    expect(cleared.view.phase).toBe("setup");
    expect(JSON.parse(storage.getItem(LOCAL_DEBUG_BROWSER_STORAGE_KEY) ?? "null")).toMatchObject({
      version: 1,
      flow: { viewerSide: "south" },
    });
  });

  it("builds every viewer view from saved MatchState without leaking hidden opponent details", () => {
    const storage = new MemoryStorage();
    const harness = createLocalDebugBrowserHarness(storage, "south");
    unwrap(harness.reset("south", "active"));

    const southView = unwrap(createLocalDebugBrowserHarness(storage, "south").getView("south"));
    const northView = unwrap(createLocalDebugBrowserHarness(storage, "north").getView("north"));

    expect(JSON.stringify(southView)).not.toContain("North Hidden Shade");
    expect(JSON.stringify(southView)).not.toContain("North Reserve Secret");
    expect(JSON.stringify(northView)).not.toContain("South Reserve");
    expect(JSON.stringify(northView)).not.toContain("baseAttack\":1200");
    expect((JSON.parse(storage.getItem(LOCAL_DEBUG_BROWSER_STORAGE_KEY) ?? "null") as { state: typeof localDebugMatchState }).state.units.length).toBe(localDebugMatchState.units.length);
  });
});
