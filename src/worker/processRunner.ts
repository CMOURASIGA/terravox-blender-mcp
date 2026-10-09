import { spawn, type ChildProcess } from "node:child_process";

export interface ProcessSpec {
  command: string;
  args: readonly string[];
  cwd: string;
  env: Readonly<Record<string, string>>;
  timeoutMs: number;
  maxOutputBytes: number;
  killGraceMs: number;
  signal?: AbortSignal;
}

export interface ProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  durationMs: number;
  timedOut: boolean;
  aborted: boolean;
  spawnError?: { code: string | undefined; message: string };
}

export interface ProcessRunner {
  run(spec: ProcessSpec): Promise<ProcessResult>;
}

class OutputCollector {
  private readonly chunks: Buffer[] = [];
  private size = 0;
  truncated = false;

  constructor(private readonly limit: number) {}

  push(chunk: Buffer): void {
    const remaining = this.limit - this.size;
    if (remaining <= 0) {
      this.truncated = true;
      return;
    }
    if (chunk.length > remaining) {
      this.chunks.push(chunk.subarray(0, remaining));
      this.size += remaining;
      this.truncated = true;
      return;
    }
    this.chunks.push(chunk);
    this.size += chunk.length;
  }

  text(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

export class SpawnProcessRunner implements ProcessRunner {
  run(spec: ProcessSpec): Promise<ProcessResult> {
    const startedAt = performance.now();
    const base = (): ProcessResult => ({
      exitCode: null,
      signal: null,
      stdout: "",
      stderr: "",
      stdoutTruncated: false,
      stderrTruncated: false,
      durationMs: Math.round(performance.now() - startedAt),
      timedOut: false,
      aborted: false,
    });

    if (spec.signal?.aborted) {
      return Promise.resolve({ ...base(), aborted: true });
    }

    return new Promise<ProcessResult>((resolve) => {
      const stdout = new OutputCollector(spec.maxOutputBytes);
      const stderr = new OutputCollector(spec.maxOutputBytes);
      let timedOut = false;
      let aborted = false;
      let settled = false;
      let child: ChildProcess;
      let killTimer: NodeJS.Timeout | undefined;
      let forceResolveTimer: NodeJS.Timeout | undefined;

      const settle = (partial: Partial<ProcessResult>): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutTimer);
        clearTimeout(killTimer);
        clearTimeout(forceResolveTimer);
        spec.signal?.removeEventListener("abort", onAbort);
        resolve({
          ...base(),
          stdout: stdout.text(),
          stderr: stderr.text(),
          stdoutTruncated: stdout.truncated,
          stderrTruncated: stderr.truncated,
          timedOut,
          aborted,
          ...partial,
        });
      };

      const killTree = (signal: NodeJS.Signals): void => {
        const pid = child.pid;
        if (pid === undefined) return;
        try {
          process.kill(-pid, signal);
        } catch {
          try {
            child.kill(signal);
          } catch {}
        }
      };

      const terminate = (): void => {
        killTree("SIGTERM");
        killTimer = setTimeout(() => {
          killTree("SIGKILL");
          forceResolveTimer = setTimeout(() => settle({ signal: "SIGKILL" }), 2_000);
        }, spec.killGraceMs);
      };

      const onAbort = (): void => {
        aborted = true;
        terminate();
      };

      try {
        child = spawn(spec.command, [...spec.args], {
          cwd: spec.cwd,
          env: { ...spec.env },
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
          detached: true,
          windowsHide: true,
        });
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        resolve({ ...base(), spawnError: { code: err.code, message: err.message } });
        return;
      }

      const timeoutTimer = setTimeout(() => {
        timedOut = true;
        terminate();
      }, spec.timeoutMs);

      spec.signal?.addEventListener("abort", onAbort, { once: true });
      child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.once("error", (error: NodeJS.ErrnoException) => {
        settle({ spawnError: { code: error.code, message: error.message } });
      });
      child.once("close", (exitCode, signal) => {
        settle({ exitCode, signal });
      });
    });
  }
}
