import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";

const intFrom = (min: number, max: number, fallback: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback);

const boolFrom = (fallback: boolean) =>
  z
    .enum(["true", "false", "1", "0"])
    .default(fallback ? "true" : "false")
    .transform((value) => value === "true" || value === "1");

const workerEnvSchema = z.object({
  WORKER_ID: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._:-]{1,100}$/, "WORKER_ID may contain letters, digits and . _ : -")
    .optional(),
  WORKER_POLL_INTERVAL_MS: intFrom(100, 60_000, 2_000),
  WORKER_LEASE_SECONDS: intFrom(5, 3_600, 60),
  WORKER_HEARTBEAT_INTERVAL_MS: intFrom(500, 600_000, 15_000),
  WORKER_MAX_ATTEMPTS: intFrom(1, 10, 3),
  WORKER_RETRY_DELAY_MS: intFrom(0, 3_600_000, 5_000),
  WORKER_SHUTDOWN_GRACE_MS: intFrom(0, 600_000, 30_000),
  WORKER_WORKSPACE_ROOT: z.string().trim().min(1).optional(),
  WORKER_STALE_WORKSPACE_MAX_AGE_MS: intFrom(60_000, 7 * 24 * 3_600_000, 3_600_000),
  WORKER_REQUIRE_BLENDER_AT_STARTUP: boolFrom(true),
  BLENDER_PATH: z
    .string()
    .trim()
    .min(1)
    .default("blender")
    .refine(
      (value) => path.isAbsolute(value) || !/[\\/]/.test(value),
      "BLENDER_PATH must be a bare command name or an absolute path",
    ),
  BLENDER_TIMEOUT_MS: intFrom(1_000, 3_600_000, 120_000),
  BLENDER_KILL_GRACE_MS: intFrom(100, 60_000, 3_000),
  BLENDER_MAX_OUTPUT_BYTES: intFrom(1_024, 16 * 1024 * 1024, 256 * 1024),
  BLENDER_MAX_RESULT_BYTES: intFrom(1_024, 16 * 1024 * 1024, 1024 * 1024),
  BLENDER_ASSETS_DIR: z.string().trim().min(1).optional(),
  BLENDER_SCRIPTS_DIR: z.string().trim().min(1).optional(),
});

export interface WorkerConfig {
  workerId: string;
  pollIntervalMs: number;
  leaseSeconds: number;
  heartbeatIntervalMs: number;
  maxAttempts: number;
  retryDelayMs: number;
  shutdownGraceMs: number;
  workspaceRoot: string;
  staleWorkspaceMaxAgeMs: number;
  requireBlenderAtStartup: boolean;
  blenderPath: string;
  blenderTimeoutMs: number;
  killGraceMs: number;
  maxOutputBytes: number;
  maxResultBytes: number;
  assetsDir: string;
  scriptsDir: string;
}

export function loadWorkerConfig(
  source: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): WorkerConfig {
  const parsed = workerEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid worker environment: ${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;

  if (env.WORKER_HEARTBEAT_INTERVAL_MS * 2 >= env.WORKER_LEASE_SECONDS * 1_000) {
    throw new Error(
      "Invalid worker environment: WORKER_HEARTBEAT_INTERVAL_MS must be less than half of WORKER_LEASE_SECONDS",
    );
  }

  return {
    workerId: env.WORKER_ID ?? `${hostname()}-${String(process.pid)}`,
    pollIntervalMs: env.WORKER_POLL_INTERVAL_MS,
    leaseSeconds: env.WORKER_LEASE_SECONDS,
    heartbeatIntervalMs: env.WORKER_HEARTBEAT_INTERVAL_MS,
    maxAttempts: env.WORKER_MAX_ATTEMPTS,
    retryDelayMs: env.WORKER_RETRY_DELAY_MS,
    shutdownGraceMs: env.WORKER_SHUTDOWN_GRACE_MS,
    workspaceRoot: path.resolve(env.WORKER_WORKSPACE_ROOT ?? path.join(tmpdir(), "terravox-blender-worker")),
    staleWorkspaceMaxAgeMs: env.WORKER_STALE_WORKSPACE_MAX_AGE_MS,
    requireBlenderAtStartup: env.WORKER_REQUIRE_BLENDER_AT_STARTUP,
    blenderPath: env.BLENDER_PATH,
    blenderTimeoutMs: env.BLENDER_TIMEOUT_MS,
    killGraceMs: env.BLENDER_KILL_GRACE_MS,
    maxOutputBytes: env.BLENDER_MAX_OUTPUT_BYTES,
    maxResultBytes: env.BLENDER_MAX_RESULT_BYTES,
    assetsDir: path.resolve(cwd, env.BLENDER_ASSETS_DIR ?? "assets/blender"),
    scriptsDir: path.resolve(cwd, env.BLENDER_SCRIPTS_DIR ?? "tools/blender"),
  };
}
