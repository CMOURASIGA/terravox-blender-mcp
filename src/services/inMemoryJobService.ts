import { randomUUID } from "node:crypto";
import type { BlenderJob } from "../domain/job.js";
import { logger } from "../lib/logger.js";

const jobs = new Map<string, BlenderJob>();

export interface CreateFakeExportInput {
  assetId: string;
  exportProfile: "terravox-default";
  correlationId?: string;
}

export class InMemoryJobService {
  createFakeExport(input: CreateFakeExportInput): BlenderJob {
    const jobId = randomUUID();
    const now = new Date().toISOString();
    const correlationId = input.correlationId ?? randomUUID();

    const job: BlenderJob = {
      id: jobId,
      operation: "export_glb",
      status: "completed",
      assetId: input.assetId,
      payload: { exportProfile: input.exportProfile },
      result: {
        simulated: true,
        artifact: {
          kind: "fake",
          reference: `memory://blender-jobs/${jobId}/asset.glb`,
          mediaType: "model/gltf-binary",
        },
        sizeBytes: 0,
        validation: {
          valid: true,
          warnings: ["B0 simulation: Blender and artifact storage are not connected."],
        },
      },
      error: null,
      attempts: 1,
      createdAt: now,
      startedAt: now,
      finishedAt: now,
      correlationId,
    };

    jobs.set(job.id, job);
    logger.info("job.fake_export_created", {
      jobId: job.id,
      assetId: job.assetId,
      correlationId,
    });

    return job;
  }

  getById(jobId: string): BlenderJob | null {
    return jobs.get(jobId) ?? null;
  }

  get size(): number {
    return jobs.size;
  }

  clear(): void {
    jobs.clear();
  }
}

export const jobService = new InMemoryJobService();
