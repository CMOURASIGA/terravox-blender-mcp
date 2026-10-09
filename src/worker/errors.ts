import type { BlenderJobError } from "../domain/job.js";

export const WORKER_ERROR_CODES = [
  "BLENDER_NOT_FOUND",
  "ASSET_NOT_FOUND",
  "BLENDER_TIMEOUT",
  "BLENDER_EXIT_ERROR",
  "INVALID_BLENDER_OUTPUT",
  "OUTPUT_TOO_LARGE",
  "LEASE_LOST",
  "SCRIPT_NOT_ALLOWED",
  "OPERATION_NOT_SUPPORTED",
  "INVALID_PAYLOAD",
  "WORKSPACE_ERROR",
  "DATABASE_ERROR",
  "WORKER_SHUTDOWN",
  "MAX_ATTEMPTS_EXCEEDED",
  "INTERNAL_ERROR",
  "JOB_ABORTED",
] as const;

export type WorkerErrorCode = (typeof WORKER_ERROR_CODES)[number];

const RETRYABLE: ReadonlySet<WorkerErrorCode> = new Set<WorkerErrorCode>([
  "BLENDER_TIMEOUT",
  "BLENDER_EXIT_ERROR",
  "WORKSPACE_ERROR",
  "DATABASE_ERROR",
  "WORKER_SHUTDOWN",
]);

export class WorkerError extends Error {
  readonly code: WorkerErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: WorkerErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "WorkerError";
    this.code = code;
    this.details = details;
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.code);
  }

  toJobError(): BlenderJobError {
    return {
      code: this.code,
      message: this.message.slice(0, 2_000),
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export function toWorkerError(error: unknown): WorkerError {
  if (error instanceof WorkerError) return error;
  const name = error instanceof Error ? error.name : typeof error;
  return new WorkerError("INTERNAL_ERROR", "Unexpected worker error", { errorName: name });
}
