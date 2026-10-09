import type { JobRepository } from "../repositories/jobRepository.js";
import type { Logger } from "../lib/logger.js";

export interface LeaseMonitorOptions {
  repository: JobRepository;
  jobId: string;
  workerId: string;
  leaseSeconds: number;
  intervalMs: number;
  log: Logger;
  onLost: (reason: "not_owner" | "expired_locally") => void;
}

export class LeaseMonitor {
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<void> | undefined;
  private stopped = false;
  private lastRenewedAt = Date.now();
  private lostFlag = false;

  constructor(private readonly options: LeaseMonitorOptions) {}

  get lost(): boolean {
    return this.lostFlag;
  }

  start(): void {
    this.lastRenewedAt = Date.now();
    this.schedule();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.inFlight;
  }

  private schedule(): void {
    if (this.stopped || this.lostFlag) return;
    this.timer = setTimeout(() => {
      this.inFlight = this.tick().finally(() => {
        this.inFlight = undefined;
        this.schedule();
      });
    }, this.options.intervalMs);
  }

  private markLost(reason: "not_owner" | "expired_locally"): void {
    if (this.lostFlag) return;
    this.lostFlag = true;
    this.options.log.error("worker.lease_lost", { code: "LEASE_LOST", reason });
    this.options.onLost(reason);
  }

  private async tick(): Promise<void> {
    const { repository, jobId, workerId, leaseSeconds, log } = this.options;
    try {
      const owned = await repository.renewLease(jobId, { workerId, leaseSeconds });
      if (this.stopped) return;
      if (!owned) {
        this.markLost("not_owner");
        return;
      }
      this.lastRenewedAt = Date.now();
      log.debug("worker.heartbeat");
    } catch {
      log.warn("worker.heartbeat_failed", { code: "DATABASE_ERROR" });
      const safetyMarginMs = Math.min(2_000, leaseSeconds * 100);
      if (!this.stopped && Date.now() - this.lastRenewedAt >= leaseSeconds * 1_000 - safetyMarginMs) {
        this.markLost("expired_locally");
      }
    }
  }
}
