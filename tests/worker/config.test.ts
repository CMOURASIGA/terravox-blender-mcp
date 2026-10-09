import { describe, expect, it } from "vitest";
import { loadWorkerConfig } from "../../src/worker/config.js";

describe("loadWorkerConfig", () => {
  it("applies safe defaults", () => {
    const config = loadWorkerConfig({}, "/srv/app");
    expect(config).toMatchObject({
      pollIntervalMs: 2_000,
      leaseSeconds: 60,
      heartbeatIntervalMs: 15_000,
      maxAttempts: 3,
      blenderPath: "blender",
      blenderTimeoutMs: 120_000,
      requireBlenderAtStartup: true,
      assetsDir: "/srv/app/assets/blender",
      scriptsDir: "/srv/app/tools/blender",
    });
  });

  it("requires the heartbeat to be shorter than half the lease", () => {
    expect(() => loadWorkerConfig({ WORKER_LEASE_SECONDS: "30", WORKER_HEARTBEAT_INTERVAL_MS: "15000" })).toThrow(/HEARTBEAT/);
  });

  it("rejects a relative BLENDER_PATH", () => {
    expect(() => loadWorkerConfig({ BLENDER_PATH: "./bin/blender" })).toThrow(/BLENDER_PATH/);
  });

  it("accepts an absolute BLENDER_PATH and rejects invalid numbers", () => {
    expect(loadWorkerConfig({ BLENDER_PATH: "/opt/blender/blender" }).blenderPath).toBe("/opt/blender/blender");
    expect(() => loadWorkerConfig({ BLENDER_TIMEOUT_MS: "10" })).toThrow();
  });
});
