import { z } from "zod";

export const assetIdSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "assetId must use lowercase letters, numbers and hyphens");

export const jobIdSchema = z.uuid();
export const exportProfileSchema = z.enum(["terravox-default"]);

export const blenderJobStatusSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

export const blenderOperationSchema = z.enum([
  "inspect_asset",
  "validate_asset",
  "render_preview",
  "optimize_asset",
  "export_glb",
]);

export type BlenderJobStatus = z.infer<typeof blenderJobStatusSchema>;
export type BlenderOperation = z.infer<typeof blenderOperationSchema>;

export interface BlenderJobError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface BlenderJob {
  id: string;
  operation: BlenderOperation;
  status: BlenderJobStatus;
  assetId: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: BlenderJobError | null;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  correlationId: string;
}
