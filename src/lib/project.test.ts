import { describe, expect, it } from "vitest";

import { formatProjectTitle, projectMetadata } from "./project";

describe("project metadata", () => {
  it("keeps the public project name available for smoke tests", () => {
    expect(projectMetadata.name).toBe("ARCANA GRID");
  });

  it("formats display titles consistently", () => {
    expect(formatProjectTitle(" arcana grid ")).toBe("ARCANA GRID");
  });
});
