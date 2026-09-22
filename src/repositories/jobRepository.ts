import type {
  BlenderJob,
  BlenderJobError,
  BlenderJobStatus,
  BlenderOperation,
} from "../domain/job.js";

export interface CreateJobRecord {
  id: string;
  operation: BlenderOperation;
  assetId: string;
  payload: Record<string, unknown>;
  correlationId: string;
}

export interface JobStateUpdate {
  from: BlenderJobStatus;
  to: BlenderJobStatus;
  result?: Record<string, unknown> | null;
  error?: BlenderJobError | null;
}

export interface ClaimOptions {
  workerId: string;
  leaseSeconds: number;
}

export interface JobStoreHealth {
  type: "supabase-postgres";
  status: "ok";
}

export interface JobRepository {
  create(input: CreateJobRecord): Promise<BlenderJob>;
  getById(jobId: string): Promise<BlenderJob | null>;
  updateState(jobId: string, update: JobStateUpdate): Promise<BlenderJob>;
  claimNext(options: ClaimOptions): Promise<BlenderJob | null>;
  health(): Promise<JobStoreHealth>;
}
