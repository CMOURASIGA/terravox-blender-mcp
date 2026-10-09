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

export interface LeaseRenewal {
  workerId: string;
  leaseSeconds: number;
}

export type OwnedOutcome =
  | { status: "completed"; result: Record<string, unknown> }
  | { status: "failed"; error: BlenderJobError };

export interface LeaseRelease {
  /** Last failure, persisted for audit while the job waits for another attempt. */
  error?: BlenderJobError;
  /** Delay before the job can be claimed again. 0 = immediately. */
  retryAfterMs: number;
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
  /** Heartbeat. Resolves false when this worker no longer owns a live lease. */
  renewLease(jobId: string, options: LeaseRenewal): Promise<boolean>;
  /** Terminal write guarded by ownership and a non-expired lease. */
  finishOwned(jobId: string, workerId: string, outcome: OwnedOutcome): Promise<boolean>;
  /** Gives the job back while the lease is still owned and valid. */
  releaseLease(jobId: string, workerId: string, release: LeaseRelease): Promise<boolean>;
  health(): Promise<JobStoreHealth>;
}
