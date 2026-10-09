import { describe, expect, it } from "vitest";
import { healthyBlender, makeHarness, waitFor } from "./support/harness.js";

describe("BlenderWorker loop", () => {
  it("polls, claims a queued job and completes it", async () => {
    const h = await makeHarness();
    const job = await h.enqueue();
    const running = h.worker.run();
    await waitFor(async () => (await h.repository.getById(job.id))?.status === "completed");
    await h.worker.shutdown("test");
    await running;
    expect(h.runner.calls).toHaveLength(1);
  });

  it("survives claim errors with backoff and recovers", async () => {
    const h = await makeHarness();
    h.repository.failNext = { claim: 2 };
    const job = await h.enqueue();
    const running = h.worker.run();
    await waitFor(async () => (await h.repository.getById(job.id))?.status === "completed", 5_000);
    await h.worker.shutdown("test");
    await running;
    expect(h.logs.filter((l) => l.event === "worker.claim_failed")).toHaveLength(2);
  });

  it("processes jobs sequentially", async () => {
    let active = 0;
    let maxActive = 0;
    const h = await makeHarness({
      handler: async (spec, n) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 30));
        active -= 1;
        return healthyBlender(spec, n);
      },
    });
    const jobs = [await h.enqueue(), await h.enqueue(), await h.enqueue()];
    const running = h.worker.run();
    await waitFor(async () => (await Promise.all(jobs.map((j) => h.repository.getById(j.id)))).every((j) => j?.status === "completed"));
    await h.worker.shutdown("test");
    await running;
    expect(maxActive).toBe(1);
  });
});

describe("BlenderWorker graceful shutdown", () => {
  it("stops promptly when idle", async () => {
    const h = await makeHarness({ config: { pollIntervalMs: 60_000 } });
    const running = h.worker.run();
    await new Promise((r) => setTimeout(r, 30));
    const started = Date.now();
    await h.worker.shutdown("SIGTERM");
    await running;
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("lets an in-flight job finish within grace, then stops claiming", async () => {
    const h = await makeHarness({
      config: { shutdownGraceMs: 2_000 },
      handler: async (spec, n) => { await new Promise((r) => setTimeout(r, 120)); return healthyBlender(spec, n); },
    });
    const first = await h.enqueue();
    const second = await h.enqueue();
    const running = h.worker.run();
    await waitFor(() => h.runner.calls.length === 1);
    await h.worker.shutdown("SIGTERM");
    await running;
    expect((await h.repository.getById(first.id))?.status).toBe("completed");
    expect((await h.repository.getById(second.id))?.status).toBe("queued");
  });

  it("aborts a stuck job after grace and releases it", async () => {
    const h = await makeHarness({
      config: { shutdownGraceMs: 80 },
      handler: (spec) => new Promise((resolve) => {
        spec.signal?.addEventListener("abort", () => resolve({ aborted: true }));
      }),
    });
    const job = await h.enqueue();
    const running = h.worker.run();
    await waitFor(() => h.runner.calls.length === 1);
    await h.worker.shutdown("SIGTERM");
    await running;
    expect(await h.repository.getById(job.id)).toMatchObject({ status: "processing", error: { code: "WORKER_SHUTDOWN" } });
    expect(await h.repository.claimNext({ workerId: "worker-b", leaseSeconds: 60 })).toMatchObject({ id: job.id, attempts: 2 });
  });
});
