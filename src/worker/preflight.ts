import os from "node:os";
import { WorkerError } from "./errors.js";
import type { ProcessRunner } from "./processRunner.js";

export async function detectBlenderVersion(runner: ProcessRunner, blenderPath: string): Promise<string> {
  const result = await runner.run({
    command: blenderPath,
    args: ["--version"],
    cwd: os.tmpdir(),
    env: { PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin", HOME: os.tmpdir(), LC_ALL: "C.UTF-8" },
    timeoutMs: 30_000,
    killGraceMs: 2_000,
    maxOutputBytes: 16 * 1024,
  });

  if (result.spawnError) {
    throw new WorkerError("BLENDER_NOT_FOUND", "Blender executable was not found or is not executable", {
      spawnCode: result.spawnError.code,
    });
  }
  const match = /^Blender\s+(\S+)/m.exec(result.stdout);
  if (result.exitCode !== 0 || !match?.[1]) {
    throw new WorkerError("BLENDER_EXIT_ERROR", "`blender --version` failed", { exitCode: result.exitCode });
  }
  return match[1];
}
