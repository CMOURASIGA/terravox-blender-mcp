import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AssetResolver } from "../../src/worker/assetResolver.js";
import { WorkerError } from "../../src/worker/errors.js";

async function setup() {
  const base = await mkdtemp(path.join(tmpdir(), "b2-assets-"));
  const dir = path.join(base, "assets");
  await mkdir(dir);
  await writeFile(path.join(dir, "cube.blend"), "x");
  return { base, dir };
}

const codeOf = async (promise: Promise<unknown>) => {
  try { await promise; return "no-error"; }
  catch (error) { return error instanceof WorkerError ? error.code : "other"; }
};

describe("AssetResolver", () => {
  it("resolves cube-test to the registered cube.blend", async () => {
    const { dir } = await setup();
    const asset = await new AssetResolver(dir).resolve("cube-test");
    expect(path.basename(asset.sourcePath)).toBe("cube.blend");
  });

  it.each(["../etc/passwd", "/etc/passwd", "CUBE-TEST", "cube test", "cube.blend", "constructor", "__proto__", "", "unknown-asset"])(
    "rejects invalid or unregistered assetId %j",
    async (assetId) => {
      const { dir } = await setup();
      expect(await codeOf(new AssetResolver(dir).resolve(assetId))).toBe("ASSET_NOT_FOUND");
    },
  );

  it("reports ASSET_NOT_FOUND when the registered file is missing", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "b2-assets-"));
    expect(await codeOf(new AssetResolver(base).resolve("cube-test"))).toBe("ASSET_NOT_FOUND");
  });

  it("refuses a symlink that escapes the assets directory", async () => {
    const { base } = await setup();
    await writeFile(path.join(base, "secret.blend"), "secret");
    const linked = path.join(base, "linked");
    await mkdir(linked);
    await symlink(path.join(base, "secret.blend"), path.join(linked, "cube.blend"));
    expect(await codeOf(new AssetResolver(linked).resolve("cube-test"))).toBe("ASSET_NOT_FOUND");
  });

  it("rejects catalog entries that contain a path", () => {
    expect(() => new AssetResolver("/tmp", [{ assetId: "bad-entry", fileName: "../x.blend" }])).toThrow();
  });
});
