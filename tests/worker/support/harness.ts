import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { BlenderJob } from "../../../src/domain/job.js";
import type { Logger, LogData } from "../../../src/lib/logger.js";
import { AssetResolver } from "../../../src/worker/assetResolver.js";
import { loadWorkerConfig, type WorkerConfig } from "../../../src/worker/config.js";
import { JobProcessor } from "../../../src/worker/jobProcessor.js";
import type { ProcessResult, ProcessRunner, ProcessSpec } from "../../../src/worker/processRunner.js";
import { ScriptRegistry } from "../../../src/worker/scriptRegistry.js";
import { BlenderWorker } from "../../../src/worker/worker.js";
import { WorkspaceManager } from "../../../src/worker/workspace.js";
import { FakeJobRepository } from "../../support/fakeJobRepository.js";

export interface LogEntry {
  level: string;
  event: string;
  data: LogData;
}

export function capturingLogger(entries: LogEntry[] = [], context: LogData = {}): Logger {
  const push = (level: string) => (event: string, data?: LogData) => {
    entries.push({ level, event, data: { ...context, ...data } });
  };
  return {
    debug: push("debug"),
    info: push("info"),
    warn: push("warn"),
    error: push("error"),
    child: (extra) => capturingLogger(entries, { ...context, ...extra }),
  };
}

export function validReport(correlationId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    correlationId,
    blenderVersion: "4.0.2",
    sceneName: "CubeScene",
    objectCount: 1,
    meshCount: 1,
    materialCount: 1,
    triangleCount: 12,
    objectNames: ["Cube"],
    materialNames: ["CubeMaterial"],
    objects: [{ name: "Cube", type: "MESH", dimensions: [2, 2, 2], location: [0, 0, 0] }],
    dimensions: [2, 2, 2],
    ...overrides,
  };
}

export function argAfter(spec: ProcessSpec, flag: string): string {
  const index = spec.args.lastIndexOf(flag);
  const value = spec.args[index + 1];
  if (index < 0 || value === undefined) throw new Error(`missing ${flag}`);
  return value;
}

export type RunnerHandler = (spec: ProcessSpec, callNumber: number) => Promise<Partial<ProcessResult>> | Partial<ProcessResult>;

export class FakeProcessRunner implements ProcessRunner {
  readonly calls: ProcessSpec[] = [];
  constructor(private readonly handler: RunnerHandler) {}

  async run(spec: ProcessSpec): Promise<ProcessResult> {
    this.calls.push(spec);
    const partial = await this.handler(spec, this.calls.length);
    return {
      exitCode: 0,
      signal: null,
      stdout: "",
      stderr: "",
      stdoutTruncated: false,
      stderrTruncated: false,
      durationMs: 5,
      timedOut: false,
      aborted: false,
      ...partial,
    };
  }
}

export const healthyBlender: RunnerHandler = async (spec) => {
  await writeFile(argAfter(spec, "--output"), JSON.stringify(validReport(argAfter(spec, "--correlation-id"))));
  return { stdout: "Blender 4.0.2\n" };
};

export async function makeHarness(options: {
  handler?: RunnerHandler;
  config?: Partial<WorkerConfig>;
  withAsset?: boolean;
} = {}) {
  const base = await mkdtemp(path.join(tmpdir(), "b2-test-"));
  const assetsDir = path.join(base, "assets");
  const scriptsDir = path.join(base, "scripts");
  const workspaceRoot = path.join(base, "workspaces");
  await mkdir(assetsDir);
  await mkdir(scriptsDir);
  if (options.withAsset !== false) await writeFile(path.join(assetsDir, "cube.blend"), "BLENDER-fake");
  await writeFile(path.join(scriptsDir, "inspect.py"), "# fake");

  const config: WorkerConfig = {
    ...loadWorkerConfig({
      WORKER_ID: "test-worker",
      WORKER_WORKSPACE_ROOT: workspaceRoot,
      BLENDER_ASSETS_DIR: assetsDir,
      BLENDER_SCRIPTS_DIR: scriptsDir,
    }),
    pollIntervalMs: 20,
    heartbeatIntervalMs: 25,
    retryDelayMs: 0,
    shutdownGraceMs: 200,
    ...options.config,
  };

  const logs: LogEntry[] = [];
  const logger = capturingLogger(logs);
  const repository = new FakeJobRepository();
  const runner = new FakeProcessRunner(options.handler ?? healthyBlender);
  const assets = new AssetResolver(assetsDir);
  const scripts = new ScriptRegistry(scriptsDir);
  const workspaces = new WorkspaceManager(workspaceRoot, logger);
  const processor = new JobProcessor({
    repository,
    runner,
    config,
    logger,
    assets,
    scripts,
    workspaces,
    sleep: () => Promise.resolve(),
  });
  const worker = new BlenderWorker({ repository, processor, config, logger });

  const enqueue = (overrides: Partial<{ assetId: string; operation: BlenderJob["operation"]; payload: Record<string, unknown> }> = {}) =>
    repository.create({
      id: randomUUID(),
      operation: overrides.operation ?? "inspect_asset",
      assetId: overrides.assetId ?? "cube-test",
      payload: overrides.payload ?? {},
      correlationId: randomUUID(),
    });

  const claim = async () => {
    const job = await repository.claimNext({ workerId: config.workerId, leaseSeconds: config.leaseSeconds });
    if (!job) throw new Error("no job to claim");
    return job;
  };

  const workspaceDirs = async () => {
    try {
      return await readdir(workspaceRoot);
    } catch {
      return [];
    }
  };

  return { config, logs, repository, runner, assets, scripts, workspaces, processor, worker, enqueue, claim, workspaceDirs, base, workspaceRoot, assetsDir, scriptsDir };
}

export const neverAborted = new AbortController().signal;

export async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
