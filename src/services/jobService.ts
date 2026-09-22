import { randomUUID } from "node:crypto";
import {
  canTransitionJob,
  InvalidJobTransitionError,
  type BlenderJob,
  type BlenderJobError,
  type BlenderJobStatus,
} from "../domain/job.js";
import type { JobRepository, JobStoreHealth } from "../repositories/jobRepository.js";

export interface CreateSimulatedExportInput {
  assetId: string;
  exportProfile: "terravox-default";
  correlationId?: string;
}

export class JobService {
  constructor(private readonly repository: JobRepository) {}

  createSimulatedExport(input: CreateSimulatedExportInput): Promise<BlenderJob> {
    return this.repository.create({
      id: randomUUID(),
      operation: "export_glb",
      assetId: input.assetId,
      payload: { exportProfile: input.exportProfile, simulated: true },
      correlationId: input.correlationId ?? randomUUID(),
    });
  }

  getById(jobId: string): Promise<BlenderJob | null> {
    return this.repository.getById(jobId);
  }

  async updateState(
    job: BlenderJob,
    to: BlenderJobStatus,
    values: { result?: Record<string, unknown> | null; error?: BlenderJobError | null } = {},
  ): Promise<BlenderJob> {
    if (!canTransitionJob(job.status, to)) {
      throw new InvalidJobTransitionError(job.status, to);
    }
    return await this.repository.updateState(job.id, { from: job.status, to, ...values });
  }

  claimNext(workerId: string, leaseSeconds = 60): Promise<BlenderJob | null> {
    if (!workerId.trim()) throw new Error("workerId is required");
    if (!Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 3_600) {
      throw new Error("leaseSeconds must be an integer between 5 and 3600");
    }
    return this.repository.claimNext({ workerId, leaseSeconds });
  }

  health(): Promise<JobStoreHealth> {
    return this.repository.health();
  }
}
