import { describe, expect, it } from "vitest";
import { detectBlenderVersion } from "../../src/worker/preflight.js";
import { FakeProcessRunner } from "./support/harness.js";

describe("detectBlenderVersion", () => {
  it("parses the version from blender --version", async () => {
    const runner = new FakeProcessRunner(() => ({ stdout: "Blender 4.0.2\n\tbuild date: x\n" }));
    expect(await detectBlenderVersion(runner, "blender")).toBe("4.0.2");
  });

  it("throws BLENDER_NOT_FOUND when the binary is missing", async () => {
    const runner = new FakeProcessRunner(() => ({ spawnError: { code: "ENOENT", message: "x" } }));
    await expect(detectBlenderVersion(runner, "blender")).rejects.toMatchObject({ code: "BLENDER_NOT_FOUND" });
  });

  it("throws BLENDER_EXIT_ERROR on unparsable output", async () => {
    const runner = new FakeProcessRunner(() => ({ stdout: "garbage" }));
    await expect(detectBlenderVersion(runner, "blender")).rejects.toMatchObject({ code: "BLENDER_EXIT_ERROR" });
  });
});
