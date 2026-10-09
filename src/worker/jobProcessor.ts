import { z } from "zod";
import type { BlenderJob } from "../domain/job.js";
import type { Logger } from "../lib/logger.js";
import type { JobRepository, OwnedOutcome } from "../repositories/jobRepository.js";
import type { AssetResolver } from "./assetResolver.js";
import { BlenderExecutor } from "./blenderExecutor.js";
import type { WorkerConfig } from "./config.js";
import { toWorkerError, WorkerError } from "./errors.js";
import { LeaseMonitor } from "./leaseMonitor.js";
import type { ProcessRunner } from "./processRunner.js";
import { Redactor } from "./redactor.js";
import type { ScriptRegistry } from "./scriptRegistry.js";
import type { Workspace, WorkspaceManager } from "./workspace.js";

export type JobOutcome = "completed" | "failed" | "retry" | "released" | "lease_lost" | "persist_failed";

export interface JobProcessorDeps {
  repository: JobRepository;
  runner: ProcessRunner;
  config: WorkerConfig;
  logger: Logger;
  assets: AssetResolver;
  scripts: ScriptRegistry;
  workspaces: WorkspaceManager;
  sleep?: (ms: number) => Promise<void>;
}

const inspectPayloadSchema = z.object({}).strict();
const DB_WRITE_ATTEMPTS = 3;

export class JobProcessor {
  private readonly executor: BlenderExecutor;

  constructor(private readonly deps: JobProcessorDeps) {
    const { config } = deps;
    this.executor = new BlenderExecutor(
      deps.runner,
      new Redactor([
        [config.workspaceRoot, "<workspace-root>"],
        [config.assetsDir, "<assets>"],
        [config.scriptsDir, "<scripts>"],
        [process.cwd(), "<app>"],
      ]),
      {
        blenderPath: config.blenderPath,
        timeoutMs: config.blenderTimeoutMs,
        killGraceMs: config.killGraceMs,
        maxOutputBytes: config.maxOutputBytes,
        maxResultBytes: config.maxResultBytes,
      },
    );
  }

  async process(job: BlenderJob, forceStop: AbortSignal): Promise<JobOutcome> {
    const { config, repository } = this.deps;
    const log = this.deps.logger.child({
      jobId: job.id,
      correlationId: job.correlationId,
      attempt: job.attempts,
      operation: job.operation,
      assetId: job.assetId,
    });
    const startedAt = Date.now();
    log.info("worker.job_claimed", { maxAttempts: config.maxAttempts });

    if (job.attempts > config.maxAttempts) {
      return await this.fail(
        job,
        new WorkerError("MAX_ATTEMPTS_EXCEEDED", "Job exceeded the maximum number of attempts", {
          attempts: job.attempts,
          maxAttempts: config.maxAttempts,
        }),
        log,
      );
    }

    const abort = new AbortController();
    const onForceStop = (): void => abort.abort();
    if (forceStop.aborted) abort.abort();
    else forceStop.addEventListener("abort", onForceStop, { once: true });

    const monitor = new LeaseMonitor({
      repository,
      jobId: job.id,
      workerId: config.workerId,
      leaseSeconds: config.leaseSeconds,
      intervalMs: config.heartbeatIntervalMs,
      log,
      onLost: () => abort.abort(),
    });
    monitor.start();

    let workspace: Workspace | undefined;
    let result: Record<string, unknown> | undefined;
    let failure: WorkerError | undefined;
    try {
      result = await this.execute(job, abort.signal, log, (created) => {
        workspace = created;
      });
    } catch (error) {
      failure = toWorkerError(error);
    } finally {
      await monitor.stop();
      forceStop.removeEventListener("abort", onForceStop);
      if (workspace) {
        const cleaned = await this.deps.workspaces.cleanup(workspace);
        log.info("worker.workspace_cleaned", { cleaned });
      }
    }

    if (monitor.lost) {
      log.error("worker.job_abandoned", { code: "LEASE_LOST" });
      return "lease_lost";
    }

    if (!failure && result) {
      return await this.persist(job, { status: "completed", result }, log, startedAt);
    }

    const error = failure ?? new WorkerError("INTERNAL_ERROR", "Job produced no result");
    if (error.code === "JOB_ABORTED") {
      return await this.release(
        job,
        new WorkerError("WORKER_SHUTDOWN", "Worker shut down while processing the job"),
        0,
        log,
        "released",
      );
    }
    if (error.retryable && job.attempts < config.maxAttempts) {
      return await this.release(job, error, config.retryDelayMs, log, "retry");
    }
    return await this.fail(job, error, log);
  }

  private async execute(
    job: BlenderJob,
    signal: AbortSignal,
    log: Logger,
    onWorkspace: (workspace: Workspace) => void,
  ): Promise<Record<string, unknown>> {
    const { assets, scripts, workspaces, config } = this.deps;

    const script = scripts.forOperation(job.operation);
    if (!inspectPayloadSchema.safeParse(job.payload).success) {
      throw new WorkerError("INVALID_PAYLOAD", "Job payload is not accepted for this operation", {
        acceptedKeys: [],
      });
    }
    const asset = await assets.resolve(job.assetId);

    const workspace = await workspaces.create(job.id);
    onWorkspace(workspace);
    await assets.stage(asset, workspace.inputPath);

    log.info("worker.blender_starting", { script: script.fileName });
    const run = await this.executor.inspect({
      workspace,
      script,
      correlationId: job.correlationId,
      signal,
    });
    log.info("worker.blender_finished", { durationMs: run.execution.durationMs, exitCode: run.execution.exitCode });

    return {
      operation: job.operation,
      assetId: job.assetId,
      correlationId: job.correlationId,
      report: run.report,
      execution: run.execution,
      worker: { id: config.workerId, attempt: job.attempts },
    };
  }

  private async fail(job: BlenderJob, error: WorkerError, log: Logger): Promise<JobOutcome> {
    log.error("worker.job_failed", { code: error.code, retryable: error.retryable });
    return await this.persist(job, { status: "failed", error: error.toJobError() }, log, Date.now(), error.code);
  }

  private async persist(
    job: BlenderJob,
    outcome: OwnedOutcome,
    log: Logger,
    startedAt: number,
    code?: string,
  ): Promise<JobOutcome> {
    const { repository, config } = this.deps;
    try {
      const owned = await this.withDbRetry(() => repository.finishOwned(job.id, config.workerId, outcome), log);
      if (!owned) {
        log.error("worker.job_abandoned", { code: "LEASE_LOST", stage: "finish" });
        return "lease_lost";
      }
      if (outcome.status === "completed") {
        log.info("worker.job_completed", { totalMs: Date.now() - startedAt });
        return "completed";
      }
      log.info("worker.job_persisted_failed", { code });
      return "failed";
    } catch (error) {
      log.error("worker.persist_failed", { code: toWorkerError(error).code });
      return "persist_failed";
    }
  }

  private async release(
    job: BlenderJob,
    error: WorkerError,
    retryAfterMs: number,
    log: Logger,
    outcome: "retry" | "released",
  ): Promise<JobOutcome> {
    const { repository, config } = this.deps;
    log.warn("worker.job_released", {
      code: error.code,
      retryAfterMs,
      attemptsLeft: Math.max(config.maxAttempts - job.attempts, 0),
    });
    try {
      const owned = await this.withDbRetry(
        () => repository.releaseLease(job.id, config.workerId, { error: error.toJobError(), retryAfterMs }),
        log,
      );
      if (!owned) {
        log.error("worker.job_abandoned", { code: "LEASE_LOST", stage: "release" });
        return "lease_lost";
      }
      return outcome;
    } catch (dbError) {
      log.error("worker.persist_failed", { code: toWorkerError(dbError).code });
      return "persist_failed";
    }
  }

  private async withDbRetry<T>(operation: () => Promise<T>, log: Logger): Promise<T> {
    const sleep = this.deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    let lastError: unknown;
    for (let attempt = 1; attempt <= DB_WRITE_ATTEMPTS; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        log.warn("worker.db_write_failed", { code: "DATABASE_ERROR", dbAttempt: attempt });
        if (attempt < DB_WRITE_ATTEMPTS) await sleep(200 * 2 ** (attempt - 1));
      }
    }
    throw new WorkerError("DATABASE_ERROR", "Database write failed", {
      cause: lastError instanceof Error ? lastError.name : "unknown",
    });
  }
}
