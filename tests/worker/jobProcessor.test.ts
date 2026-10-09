import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  argAfter,
  healthyBlender,
  makeHarness,
  neverAborted,
  validReport,
  type RunnerHandler,
} from "./support/harness.js";

const errorOf = async (h: Awaited<ReturnType<typeof makeHarness>>, jobId: string) => (await h.repository.getById(jobId))?.error;

describe("JobProcessor - success path", () => {
  it("runs the allowlisted inspection, stores structured result and cleans workspace", async () => {
    const h = await makeHarness();
    const queued = await h.enqueue();
    const job = await h.claim();
    expect(job).toMatchObject({ id: queued.id, status: "processing", attempts: 1 });
    expect(await h.processor.process(job, neverAborted)).toBe("completed");
    const done = await h.repository.getById(job.id);
    expect(done?.status).toBe("completed");
    expect(done?.result).toMatchObject({
      operation: "inspect_asset",
      assetId: "cube-test",
      correlationId: job.correlationId,
      report: { sceneName: "CubeScene", objectCount: 1, meshCount: 1, objectNames: ["Cube"], dimensions: [2, 2, 2] },
      execution: { exitCode: 0 },
    });
    expect(JSON.stringify(done?.result)).not.toContain(h.base);
    expect(await h.workspaceDirs()).toEqual([]);
  });

  it("builds argv only from internal values and does not pass Supabase secrets", async () => {
    const h = await makeHarness();
    await h.enqueue();
    const job = await h.claim();
    await h.processor.process(job, neverAborted);
    const spec = h.runner.calls[0]!;
    expect(spec.command).toBe(h.config.blenderPath);
    expect(spec.args).toEqual(expect.arrayContaining(["--background", "--factory-startup", "--disable-autoexec", "--python-exit-code", "1"]));
    expect(argAfter(spec, "--python")).toBe(`${h.scriptsDir}/inspect.py`);
    expect(argAfter(spec, "--correlation-id")).toBe(job.correlationId);
    expect(spec.env).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
  });
});

describe("JobProcessor - input hardening", () => {
  it.each([
    { command: "rm -rf /" },
    { script: "evil.py" },
    { python: "import os" },
    { args: ["--python-expr", "x"] },
    { path: "/etc/passwd" },
  ])("rejects payload %j without spawning", async (payload) => {
    const h = await makeHarness();
    await h.enqueue({ payload });
    const job = await h.claim();
    expect(await h.processor.process(job, neverAborted)).toBe("failed");
    expect(h.runner.calls).toHaveLength(0);
    expect((await errorOf(h, job.id))?.code).toBe("INVALID_PAYLOAD");
  });

  it("fails with ASSET_NOT_FOUND for unregistered assets without spawning", async () => {
    const h = await makeHarness();
    await h.enqueue({ assetId: "unknown-asset" });
    const job = await h.claim();
    expect(await h.processor.process(job, neverAborted)).toBe("failed");
    expect((await errorOf(h, job.id))?.code).toBe("ASSET_NOT_FOUND");
    expect(h.runner.calls).toHaveLength(0);
  });

  it("fails permanently for operations outside B2", async () => {
    const h = await makeHarness();
    await h.enqueue({ operation: "export_glb", payload: { exportProfile: "terravox-default", simulated: true } });
    const job = await h.claim();
    expect(await h.processor.process(job, neverAborted)).toBe("failed");
    expect((await errorOf(h, job.id))?.code).toBe("OPERATION_NOT_SUPPORTED");
    expect(h.runner.calls).toHaveLength(0);
  });
});

describe("JobProcessor - Blender failures", () => {
  it("BLENDER_NOT_FOUND is permanent", async () => {
    const h = await makeHarness({ handler: () => ({ spawnError: { code: "ENOENT", message: "spawn blender ENOENT" } }) });
    await h.enqueue();
    const job = await h.claim();
    expect(await h.processor.process(job, neverAborted)).toBe("failed");
    expect((await errorOf(h, job.id))?.code).toBe("BLENDER_NOT_FOUND");
  });

  it("timeout retries until attempts are exhausted", async () => {
    const h = await makeHarness({ handler: () => ({ timedOut: true, exitCode: null, signal: "SIGKILL", durationMs: 120_000 }) });
    const queued = await h.enqueue();
    const outcomes: string[] = [];
    for (let attempt = 1; attempt <= h.config.maxAttempts; attempt += 1) {
      const job = await h.claim();
      outcomes.push(await h.processor.process(job, neverAborted));
      h.repository.leases.set(queued.id, { owner: h.config.workerId, expiresAt: 0 });
    }
    expect(outcomes).toEqual(["retry", "retry", "failed"]);
    expect((await h.repository.getById(queued.id))?.error?.code).toBe("BLENDER_TIMEOUT");
  });

  const malformed: [string, RunnerHandler][] = [
    ["malformed JSON", async (spec) => { await writeFile(argAfter(spec, "--output"), "{not json"); return {}; }],
    ["wrong schema", async (spec) => { await writeFile(argAfter(spec, "--output"), JSON.stringify({ hello: "world" })); return {}; }],
    ["missing output file", () => ({})],
    ["mismatched correlationId", async (spec) => {
      await writeFile(argAfter(spec, "--output"), JSON.stringify(validReport("00000000-0000-4000-8000-000000000000")));
      return {};
    }],
  ];
  it.each(malformed)("%s -> INVALID_BLENDER_OUTPUT", async (_name, handler) => {
    const h = await makeHarness({ handler });
    await h.enqueue();
    const job = await h.claim();
    expect(await h.processor.process(job, neverAborted)).toBe("failed");
    expect((await errorOf(h, job.id))?.code).toBe("INVALID_BLENDER_OUTPUT");
  });
});

describe("JobProcessor - lease ownership and heartbeat", () => {
  it("sends heartbeats while Blender runs", async () => {
    const h = await makeHarness({
      handler: async (spec) => { await new Promise((r) => setTimeout(r, 140)); return healthyBlender(spec, 1); },
    });
    await h.enqueue();
    const job = await h.claim();
    expect(await h.processor.process(job, neverAborted)).toBe("completed");
    expect(h.repository.renewCalls).toBeGreaterThanOrEqual(3);
  });

  it("aborts and writes nothing when lease ownership is lost", async () => {
    const h = await makeHarness({
      handler: (spec) => new Promise((resolve) => {
        spec.signal?.addEventListener("abort", () => resolve({ aborted: true }));
      }),
    });
    const queued = await h.enqueue();
    const job = await h.claim();
    setTimeout(() => h.repository.stealLease(queued.id, "another-worker"), 30);
    expect(await h.processor.process(job, neverAborted)).toBe("lease_lost");
    expect((await h.repository.getById(queued.id))?.status).toBe("processing");
  });

  it("does not renew or finish a job after its lease has expired", async () => {
    const h = await makeHarness({
      config: { heartbeatIntervalMs: 60_000 },
      handler: async (spec) => {
        h.repository.leases.set(job.id, { owner: h.config.workerId, expiresAt: 0 });
        return healthyBlender(spec, 1);
      },
    });
    const queued = await h.enqueue();
    const job = await h.claim();
    expect(job.id).toBe(queued.id);
    expect(await h.processor.process(job, neverAborted)).toBe("lease_lost");
    expect((await h.repository.getById(job.id))?.status).toBe("processing");
  });

  it("retries transient database errors when persisting", async () => {
    const h = await makeHarness();
    await h.enqueue();
    h.repository.failNext = { finish: 2 };
    const job = await h.claim();
    expect(await h.processor.process(job, neverAborted)).toBe("completed");
  });
});

describe("JobProcessor - shutdown", () => {
  it("aborts Blender, releases the lease and cleans workspace", async () => {
    const h = await makeHarness({
      handler: (spec) => new Promise((resolve) => {
        spec.signal?.addEventListener("abort", () => resolve({ aborted: true }));
      }),
    });
    const queued = await h.enqueue();
    const job = await h.claim();
    const force = new AbortController();
    setTimeout(() => force.abort(), 30);
    expect(await h.processor.process(job, force.signal)).toBe("released");
    expect(await h.repository.getById(queued.id)).toMatchObject({ status: "processing", error: { code: "WORKER_SHUTDOWN" } });
    expect(await h.workspaceDirs()).toEqual([]);
  });
});
