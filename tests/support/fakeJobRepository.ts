import type { BlenderJob } from "../../src/domain/job.js";
import type {
  CreateJobRecord,
  JobRepository,
  JobStateUpdate,
  JobStoreHealth,
} from "../../src/repositories/jobRepository.js";

export class FakeJobRepository implements JobRepository {
  constructor(private readonly jobs: Map<string, BlenderJob> = new Map()) {}

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

  claimNext(): Promise<BlenderJob | null> {
    const job = [...this.jobs.values()]
      .filter((candidate) => candidate.status === "queued")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (!job) return Promise.resolve(null);

    const claimed: BlenderJob = {
      ...job,
      status: "processing",
      attempts: job.attempts + 1,
      startedAt: job.startedAt ?? new Date().toISOString(),
    };
    this.jobs.set(job.id, structuredClone(claimed));
    return Promise.resolve(structuredClone(claimed));
  }

  health(): Promise<JobStoreHealth> {
    return Promise.resolve({ type: "supabase-postgres", status: "ok" });
  }
}
