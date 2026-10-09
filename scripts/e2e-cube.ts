/**
 * Real E2E for B2 (run on the Linux host that has Blender + the worker):
 *   1. creates an inspect_asset job for assetId "cube-test" in Supabase (status queued)
 *   2. waits for the running worker to claim it and finish
 *   3. asserts the result contains real data from cube.blend
 *
 * The worker must be running separately (npm run worker:start or the systemd unit).
 * Usage: node --env-file=.env dist/scripts/e2e-cube.js
 */
import { randomUUID } from "node:crypto";
import { getEnv } from "../src/config/env.js";
import { createSupabaseJobRepository } from "../src/repositories/supabaseJobRepository.js";

const TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS ?? 120_000);
const POLL_MS = 1_000;

function fail(message: string, extra?: unknown): never {
  console.error(JSON.stringify({ e2e: "cube-test", ok: false, message, extra }, null, 2));
  process.exit(1);
}

async function main(): Promise<void> {
  const env = getEnv();
  const repository = createSupabaseJobRepository(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const correlationId = randomUUID();
  const created = await repository.create({
    id: randomUUID(),
    operation: "inspect_asset",
    assetId: "cube-test",
    payload: {},
    correlationId,
  });
  console.log(JSON.stringify({ step: "job_created", jobId: created.id, correlationId, status: created.status }));

  const deadline = Date.now() + TIMEOUT_MS;
  let lastStatus = created.status;
  while (Date.now() < deadline) {
    const job = await repository.getById(created.id);
    if (!job) fail("job disappeared", { jobId: created.id });
    if (job.status !== lastStatus) {
      lastStatus = job.status;
      console.log(JSON.stringify({ step: "status_changed", status: job.status, attempts: job.attempts }));
    }

    if (job.status === "failed" || job.status === "cancelled") {
      fail(`job ended as ${job.status}`, job.error);
    }
    if (job.status === "completed") {
      const result = job.result as {
        correlationId?: string;
        report?: { objectCount?: number; meshCount?: number; objectNames?: string[]; dimensions?: number[]; blenderVersion?: string };
      } | null;
      const report = result?.report;
      const checks = {
        correlationIdMatches: result?.correlationId === correlationId,
        oneObject: report?.objectCount === 1,
        oneMesh: report?.meshCount === 1,
        hasCube: report?.objectNames?.includes("Cube") === true,
        dimensions2m: JSON.stringify(report?.dimensions) === JSON.stringify([2, 2, 2]),
      };
      if (!Object.values(checks).every(Boolean)) fail("result does not match cube.blend", { checks, result });
      console.log(JSON.stringify({ e2e: "cube-test", ok: true, jobId: job.id, attempts: job.attempts, checks, result }, null, 2));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  fail(`timed out after ${String(TIMEOUT_MS)}ms waiting for the worker (is it running?)`, { jobId: created.id, lastStatus });
}

main().catch((error: unknown) => {
  fail("e2e crashed", error instanceof Error ? error.message : String(error));
});
