import type { Logger } from "../lib/logger.js";
import type { JobRepository } from "../repositories/jobRepository.js";
import type { WorkerConfig } from "./config.js";
import { toWorkerError, WorkerError } from "./errors.js";
import type { JobProcessor } from "./jobProcessor.js";

export interface BlenderWorkerDeps {
  repository: JobRepository;
  processor: JobProcessor;
  config: WorkerConfig;
  logger: Logger;
}

const MAX_CLAIM_BACKOFF_MS = 30_000;

export class BlenderWorker {
  private stopping = false;
  private readonly forceStop = new AbortController();
  private wake: (() => void) | undefined;
  private forceTimer: NodeJS.Timeout | undefined;
  private runPromise: Promise<void> | undefined;
  private busy = false;

  constructor(private readonly deps: BlenderWorkerDeps) {}

  get isStopping(): boolean {
    return this.stopping;
  }

  run(): Promise<void> {
    this.runPromise ??= this.loop();
    return this.runPromise;
  }

  async shutdown(reason: string): Promise<void> {
    const { logger, config } = this.deps;
    if (!this.stopping) {
      this.stopping = true;
      logger.info("worker.shutdown_requested", { reason, busy: this.busy, graceMs: config.shutdownGraceMs });
      this.wake?.();
      if (this.busy) {
        this.forceTimer = setTimeout(() => {
          logger.warn("worker.shutdown_grace_exceeded", { graceMs: config.shutdownGraceMs });
          this.forceStop.abort();
        }, config.shutdownGraceMs);
      }
    }
    await this.runPromise;
    clearTimeout(this.forceTimer);
  }

  forceShutdown(): void {
    this.stopping = true;
    this.wake?.();
    this.forceStop.abort();
  }

  private async loop(): Promise<void> {
    const { repository, processor, config, logger } = this.deps;
    let consecutiveClaimErrors = 0;
    logger.info("worker.started", {
      workerId: config.workerId,
      pollIntervalMs: config.pollIntervalMs,
      leaseSeconds: config.leaseSeconds,
      heartbeatIntervalMs: config.heartbeatIntervalMs,
      maxAttempts: config.maxAttempts,
    });

    while (!this.stopping) {
      let job;
      try {
        job = await repository.claimNext({ workerId: config.workerId, leaseSeconds: config.leaseSeconds });
        consecutiveClaimErrors = 0;
      } catch (error) {
        consecutiveClaimErrors += 1;
        const delay = Math.min(config.pollIntervalMs * 2 ** consecutiveClaimErrors, MAX_CLAIM_BACKOFF_MS);
        logger.error("worker.claim_failed", {
          code: new WorkerError("DATABASE_ERROR", "claim failed").code,
          consecutiveErrors: consecutiveClaimErrors,
          retryInMs: delay,
          errorName: error instanceof Error ? error.name : "unknown",
        });
        await this.sleep(delay);
        continue;
      }

      if (!job) {
        await this.sleep(config.pollIntervalMs);
        continue;
      }

      if (this.stopping) {
        await this.handBack(job.id, job.correlationId);
        break;
      }

      this.busy = true;
      try {
        const outcome = await processor.process(job, this.forceStop.signal);
        logger.info("worker.job_done", { jobId: job.id, correlationId: job.correlationId, outcome });
      } catch (error) {
        logger.error("worker.unexpected_error", {
          jobId: job.id,
          correlationId: job.correlationId,
          code: toWorkerError(error).code,
        });
      } finally {
        this.busy = false;
      }
    }

    clearTimeout(this.forceTimer);
    logger.info("worker.stopped");
  }

  private async handBack(jobId: string, correlationId: string): Promise<void> {
    const { repository, config, logger } = this.deps;
    try {
      await repository.releaseLease(jobId, config.workerId, {
        error: new WorkerError("WORKER_SHUTDOWN", "Worker shut down before processing the job").toJobError(),
        retryAfterMs: 0,
      });
      logger.info("worker.job_handed_back", { jobId, correlationId });
    } catch {
      logger.error("worker.hand_back_failed", { jobId, correlationId, code: "DATABASE_ERROR" });
    }
  }

  private sleep(ms: number): Promise<void> {
    if (this.stopping) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = setTimeout(done, ms);
      function done(): void {
        clearTimeout(timer);
        resolve();
      }
      this.wake = done;
    }).finally(() => {
      this.wake = undefined;
    });
  }
}
