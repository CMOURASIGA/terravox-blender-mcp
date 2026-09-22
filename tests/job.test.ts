import { describe, expect, it } from "vitest";
import {
  assetIdSchema,
  blenderJobSchema,
  InvalidJobTransitionError,
  type BlenderJob,
} from "../src/domain/job.js";
import { JobService } from "../src/services/jobService.js";
import { FakeJobRepository } from "./support/fakeJobRepository.js";

describe("B1 persistent job service", () => {
  it("creates a queued simulated export and reads it through a separate service instance", async () => {
    const sharedStore = new Map<string, BlenderJob>();
    const writer = new JobService(new FakeJobRepository(sharedStore));
    const reader = new JobService(new FakeJobRepository(sharedStore));

    const created = await writer.createSimulatedExport({
      assetId: "chr-explorer-v001",
      exportProfile: "terravox-default",
    });
    const persisted = await reader.getById(created.id);

    expect(created).toMatchObject({
      operation: "export_glb",
      status: "queued",
      payload: { exportProfile: "terravox-default", simulated: true },
      attempts: 0,
    });
    expect(persisted).toEqual(created);
  });

  it("rejects invalid terminal state transitions", async () => {
    const service = new JobService(new FakeJobRepository());
    const job = await service.createSimulatedExport({
      assetId: "chr-explorer-v001",
      exportProfile: "terravox-default",
    });

    await expect(service.updateState(job, "completed")).rejects.toBeInstanceOf(
      InvalidJobTransitionError,
    );
  });

  it("allows only one of two concurrent consumers to claim a job", async () => {
    const service = new JobService(new FakeJobRepository());
    await service.createSimulatedExport({
      assetId: "chr-explorer-v001",
      exportProfile: "terravox-default",
    });

    const claims = await Promise.all([
      service.claimNext("worker-a", 60),
      service.claimNext("worker-b", 60),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.find(Boolean)).toMatchObject({ status: "processing", attempts: 1 });
  });

  it("persists a valid processing to completed transition with a structured result", async () => {
    const service = new JobService(new FakeJobRepository());
    await service.createSimulatedExport({
      assetId: "chr-explorer-v001",
      exportProfile: "terravox-default",
    });
    const processing = await service.claimNext("worker-a", 60);
    expect(processing).not.toBeNull();

    const completed = await service.updateState(processing!, "completed", {
      result: { simulated: true },
    });
    expect(completed).toMatchObject({
      status: "completed",
      attempts: 1,
      result: { simulated: true },
    });
    expect(completed.finishedAt).not.toBeNull();
  });

  it("does not accept filesystem paths as asset identifiers", () => {
    expect(assetIdSchema.safeParse("/tmp/asset.blend").success).toBe(false);
    expect(assetIdSchema.safeParse("chr-explorer-v001").success).toBe(true);
  });

  it("accepts Postgres ISO timestamps with a UTC offset", () => {
    expect(
      blenderJobSchema.safeParse({
        id: "b1000000-0000-4000-8000-202609220001",
        operation: "export_glb",
        status: "queued",
        assetId: "chr-explorer-v001",
        payload: { simulated: true },
        result: null,
        error: null,
        attempts: 0,
        createdAt: "2026-09-22T17:38:00.000000+00:00",
        startedAt: null,
        finishedAt: null,
        correlationId: "b1000000-0000-4000-8000-202609220002",
      }).success,
    ).toBe(true);
  });
});
