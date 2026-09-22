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

export const blenderJobErrorSchema = z.object({
  code: z.string().trim().min(1).max(64),
  message: z.string().trim().min(1).max(2_000),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const blenderJobSchema = z.object({
  id: jobIdSchema,
  operation: blenderOperationSchema,
  status: blenderJobStatusSchema,
  assetId: assetIdSchema,
  payload: z.record(z.string(), z.unknown()),
  result: z.record(z.string(), z.unknown()).nullable(),
  error: blenderJobErrorSchema.nullable(),
  attempts: z.int().nonnegative(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  correlationId: jobIdSchema,
});

const allowedTransitions: Readonly<Record<BlenderJobStatus, readonly BlenderJobStatus[]>> = {
  queued: ["processing", "cancelled"],
  processing: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export function canTransitionJob(from: BlenderJobStatus, to: BlenderJobStatus): boolean {
  return allowedTransitions[from].includes(to);
}

export class InvalidJobTransitionError extends Error {
  constructor(from: BlenderJobStatus, to: BlenderJobStatus) {
    super(`Invalid Blender job transition: ${from} -> ${to}`);
    this.name = "InvalidJobTransitionError";
  }
}
