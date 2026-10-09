import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SpawnProcessRunner } from "../../src/worker/processRunner.js";
import { JobProcessor } from "../../src/worker/jobProcessor.js";
import { AssetResolver } from "../../src/worker/assetResolver.js";
import { loadWorkerConfig } from "../../src/worker/config.js";
import { ScriptRegistry } from "../../src/worker/scriptRegistry.js";
import { WorkspaceManager } from "../../src/worker/workspace.js";
import { FakeJobRepository } from "../support/fakeJobRepository.js";
import { capturingLogger, neverAborted } from "./support/harness.js";

const blenderPath = process.env.BLENDER_PATH ?? "blender";
const blenderAvailable = spawnSync(blenderPath, ["--version"], { stdio: "ignore" }).status === 0;
const fixtureAvailable = existsSync(path.resolve("assets/blender/cube.blend"));

describe.skipIf(!blenderAvailable || !fixtureAvailable)("B2 integration with a real Blender", () => {
  it("inspects generated assets/blender/cube.blend end to end", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "b2-real-"));
    const config = {
      ...loadWorkerConfig({ WORKER_ID: "it-worker", WORKER_WORKSPACE_ROOT: path.join(root, "ws"), BLENDER_PATH: blenderPath }),
      retryDelayMs: 0,
    };
    const logger = capturingLogger();
    const repository = new FakeJobRepository();
    const processor = new JobProcessor({
      repository,
      runner: new SpawnProcessRunner(),
      config,
      logger,
      assets: new AssetResolver(config.assetsDir),
      scripts: new ScriptRegistry(config.scriptsDir),
      workspaces: new WorkspaceManager(config.workspaceRoot, logger),
    });

    const queued = await repository.create({
      id: randomUUID(), operation: "inspect_asset", assetId: "cube-test", payload: {}, correlationId: randomUUID(),
    });
    const job = await repository.claimNext({ workerId: config.workerId, leaseSeconds: 60 });
    expect(job?.id).toBe(queued.id);
    expect(await processor.process(job!, neverAborted)).toBe("completed");
    const done = await repository.getById(queued.id);
    expect(done?.result).toMatchObject({
      assetId: "cube-test",
      report: {
        sceneName: "CubeScene",
        objectCount: 1,
        meshCount: 1,
        materialCount: 1,
        triangleCount: 12,
        objectNames: ["Cube"],
        dimensions: [2, 2, 2],
      },
    });
    expect(JSON.stringify(done?.result)).not.toContain(process.cwd());
  }, 60_000);
});
