import type { BlenderJob } from "../../src/domain/job.js";
import type {
  ClaimOptions,
  CreateJobRecord,
  JobRepository,
  JobStateUpdate,
  JobStoreHealth,
  LeaseRelease,
  LeaseRenewal,
  OwnedOutcome,
} from "../../src/repositories/jobRepository.js";

interface Lease {
  owner: string;
  expiresAt: number;
}

export class FakeJobRepository implements JobRepository {
  readonly leases = new Map<string, Lease>();
  failNext: { claim?: number; renew?: number; finish?: number; release?: number } = {};
  renewCalls = 0;

  constructor(private readonly jobs: Map<string, BlenderJob> = new Map()) {}

  stealLease(jobId: string, newOwner: string): void {
    this.leases.set(jobId, { owner: newOwner, expiresAt: Date.now() + 60_000 });
  }

  private maybeFail(kind: keyof FakeJobRepository["failNext"]): void {
    const remaining = this.failNext[kind] ?? 0;
    if (remaining > 0) {
      this.failNext[kind] = remaining - 1;
      throw new Error(`simulated database ${kind} failure`);
    }
  }

  private owns(jobId: string, workerId: string): boolean {
    const job = this.jobs.get(jobId);
    const lease = this.leases.get(jobId);
    return job?.status === "processing" && lease?.owner === workerId && lease.expiresAt > Date.now();
  }

  create(input: CreateJobRecord): Promise<BlenderJob> {
    const job: BlenderJob = {
      id: input.id,
      operation: input.operation,
      status: "queued",
      assetId: input.assetId,
      payload: input.payload,
      result: null,
      error: null,
      attempts: 0,
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      correlationId: input.correlationId,
    };
    this.jobs.set(job.id, structuredClone(job));
    return Promise.resolve(structuredClone(job));
  }

  getById(jobId: string): Promise<BlenderJob | null> {
    const job = this.jobs.get(jobId);
    return Promise.resolve(job ? structuredClone(job) : null);
  }

  updateState(jobId: string, update: JobStateUpdate): Promise<BlenderJob> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== update.from) throw new Error("optimistic update rejected");
    const now = new Date().toISOString();
    const next: BlenderJob = {
      ...job,
      status: update.to,
      startedAt: update.to === "processing" ? now : job.startedAt,
      finishedAt: ["completed", "failed", "cancelled"].includes(update.to) ? now : null,
      result: update.result === undefined ? job.result : update.result,
      error: update.error === undefined ? job.error : update.error,
    };
    this.jobs.set(jobId, structuredClone(next));
    return Promise.resolve(structuredClone(next));
  }

  claimNext(options?: ClaimOptions): Promise<BlenderJob | null> {
    this.maybeFail("claim");
    const now = Date.now();
    const job = [...this.jobs.values()]
      .filter(
        (candidate) =>
          candidate.status === "queued" ||
          (candidate.status === "processing" && (this.leases.get(candidate.id)?.expiresAt ?? 0) <= now),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (!job) return Promise.resolve(null);

    const claimed: BlenderJob = {
      ...job,
      status: "processing",
      attempts: job.attempts + 1,
      startedAt: job.startedAt ?? new Date().toISOString(),
    };
    this.jobs.set(job.id, structuredClone(claimed));
    this.leases.set(job.id, {
      owner: options?.workerId ?? "anonymous",
      expiresAt: now + (options?.leaseSeconds ?? 60) * 1_000,
    });
    return Promise.resolve(structuredClone(claimed));
  }

  renewLease(jobId: string, options: LeaseRenewal): Promise<boolean> {
    this.renewCalls += 1;
    this.maybeFail("renew");
    if (!this.owns(jobId, options.workerId)) return Promise.resolve(false);
    this.leases.set(jobId, { owner: options.workerId, expiresAt: Date.now() + options.leaseSeconds * 1_000 });
    return Promise.resolve(true);
  }

  finishOwned(jobId: string, workerId: string, outcome: OwnedOutcome): Promise<boolean> {
    this.maybeFail("finish");
    if (!this.owns(jobId, workerId)) return Promise.resolve(false);
    const job = this.jobs.get(jobId) as BlenderJob;
    this.jobs.set(
      jobId,
      structuredClone({
        ...job,
        status: outcome.status,
        finishedAt: new Date().toISOString(),
        result: outcome.status === "completed" ? outcome.result : job.result,
        error: outcome.status === "failed" ? outcome.error : null,
      }),
    );
    this.leases.delete(jobId);
    return Promise.resolve(true);
  }

  releaseLease(jobId: string, workerId: string, release: LeaseRelease): Promise<boolean> {
    this.maybeFail("release");
    if (!this.owns(jobId, workerId)) return Promise.resolve(false);
    const job = this.jobs.get(jobId) as BlenderJob;
    if (release.error) this.jobs.set(jobId, structuredClone({ ...job, error: release.error }));
    this.leases.set(jobId, { owner: workerId, expiresAt: Date.now() + release.retryAfterMs });
    return Promise.resolve(true);
  }

  health(): Promise<JobStoreHealth> {
    return Promise.resolve({ type: "supabase-postgres", status: "ok" });
  }
}
