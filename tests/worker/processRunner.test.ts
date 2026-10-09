import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { SpawnProcessRunner, type ProcessSpec } from "../../src/worker/processRunner.js";

const runner = new SpawnProcessRunner();
const spec = (args: string[], extra: Partial<ProcessSpec> = {}): ProcessSpec => ({
  command: process.execPath,
  args,
  cwd: tmpdir(),
  env: { PATH: process.env.PATH ?? "" },
  timeoutMs: 10_000,
  killGraceMs: 200,
  maxOutputBytes: 64 * 1024,
  ...extra,
});

describe("SpawnProcessRunner", () => {
  it("captures stdout, stderr, exit code and duration", async () => {
    const result = await runner.run(spec(["-e", "console.log('out'); console.error('err'); process.exit(3)"]));
    expect(result).toMatchObject({ exitCode: 3, stdout: "out\n", stderr: "err\n", timedOut: false, aborted: false });
  });

  it("never interprets arguments through a shell", async () => {
    const hostile = "; echo HACKED && $(whoami) `id`";
    const result = await runner.run(spec(["-e", "console.log(process.argv[1])", hostile]));
    expect(result.stdout.trim()).toBe(hostile);
  });

  it("kills the process and flags timeout", async () => {
    const result = await runner.run(spec(["-e", "setInterval(() => {}, 1000)"], { timeoutMs: 300 }));
    expect(result.timedOut).toBe(true);
    expect(result.durationMs).toBeLessThan(5_000);
  });

  it("escalates to SIGKILL when the process ignores SIGTERM", async () => {
    const stubborn = "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)";
    const result = await runner.run(spec(["-e", stubborn], { timeoutMs: 300, killGraceMs: 200 }));
    expect(result.timedOut).toBe(true);
    expect(result.signal).toBe("SIGKILL");
  });

  it("truncates output beyond the cap", async () => {
    const result = await runner.run(spec(["-e", "process.stdout.write('x'.repeat(100000))"], { maxOutputBytes: 1_024 }));
    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBe(1_024);
    expect(result.stdoutTruncated).toBe(true);
  });

  it("reports spawn errors for a missing executable", async () => {
    const result = await runner.run(spec([], { command: "/definitely/not/blender" }));
    expect(result.spawnError?.code).toBe("ENOENT");
  });

  it("stops the process when the abort signal fires", async () => {
    const controller = new AbortController();
    const pending = runner.run(spec(["-e", "setInterval(() => {}, 1000)"], { signal: controller.signal }));
    setTimeout(() => controller.abort(), 100);
    const result = await pending;
    expect(result.aborted).toBe(true);
  });
});
