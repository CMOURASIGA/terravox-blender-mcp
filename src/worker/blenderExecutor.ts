import { open, stat } from "node:fs/promises";
import type { InspectReport } from "./inspectReport.js";
import { inspectReportSchema } from "./inspectReport.js";
import { WorkerError } from "./errors.js";
import type { ProcessResult, ProcessRunner } from "./processRunner.js";
import type { Redactor } from "./redactor.js";
import type { ResolvedScript } from "./scriptRegistry.js";
import type { Workspace } from "./workspace.js";

export interface BlenderExecutorOptions {
  blenderPath: string;
  timeoutMs: number;
  killGraceMs: number;
  maxOutputBytes: number;
  maxResultBytes: number;
}

export interface InspectExecution {
  report: InspectReport;
  execution: {
    exitCode: number;
    durationMs: number;
    stdoutTruncated: boolean;
    stderrTruncated: boolean;
  };
}

const NOT_FOUND_SPAWN_CODES = new Set(["ENOENT", "EACCES", "ENOTDIR", "EPERM"]);

export class BlenderExecutor {
  constructor(
    private readonly runner: ProcessRunner,
    private readonly redactor: Redactor,
    private readonly options: BlenderExecutorOptions,
  ) {}

  buildArgs(workspace: Workspace, script: ResolvedScript, correlationId: string): string[] {
    return [
      "--background",
      "--factory-startup",
      "--disable-autoexec",
      "--python-exit-code",
      "1",
      workspace.inputPath,
      "--python",
      script.absolutePath,
      "--",
      "--output",
      workspace.outputPath,
      "--correlation-id",
      correlationId,
    ];
  }

  async inspect(input: {
    workspace: Workspace;
    script: ResolvedScript;
    correlationId: string;
    signal: AbortSignal;
  }): Promise<InspectExecution> {
    const { workspace, correlationId } = input;
    const result = await this.runner.run({
      command: this.options.blenderPath,
      args: this.buildArgs(workspace, input.script, correlationId),
      cwd: workspace.dir,
      env: {
        PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
        HOME: workspace.dir,
        TMPDIR: workspace.dir,
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
      },
      timeoutMs: this.options.timeoutMs,
      killGraceMs: this.options.killGraceMs,
      maxOutputBytes: this.options.maxOutputBytes,
      signal: input.signal,
    });

    this.assertCleanExit(result);
    const raw = await this.readOutput(workspace.outputPath);
    const report = this.validate(raw, correlationId);

    return {
      report,
      execution: {
        exitCode: 0,
        durationMs: result.durationMs,
        stdoutTruncated: result.stdoutTruncated,
        stderrTruncated: result.stderrTruncated,
      },
    };
  }

  private diagnostics(result: ProcessResult): Record<string, unknown> {
    return {
      exitCode: result.exitCode,
      signal: result.signal,
      durationMs: result.durationMs,
      stdoutTail: this.redactor.tail(result.stdout, 1_500),
      stderrTail: this.redactor.tail(result.stderr, 1_500),
      stdoutTruncated: result.stdoutTruncated,
      stderrTruncated: result.stderrTruncated,
    };
  }

  private assertCleanExit(result: ProcessResult): void {
    if (result.spawnError) {
      if (result.spawnError.code && NOT_FOUND_SPAWN_CODES.has(result.spawnError.code)) {
        throw new WorkerError("BLENDER_NOT_FOUND", "Blender executable was not found or is not executable", {
          spawnCode: result.spawnError.code,
        });
      }
      throw new WorkerError("INTERNAL_ERROR", "Could not start Blender", { spawnCode: result.spawnError.code });
    }
    if (result.aborted) {
      throw new WorkerError("JOB_ABORTED", "Blender process was aborted");
    }
    if (result.timedOut) {
      throw new WorkerError("BLENDER_TIMEOUT", `Blender exceeded the ${String(this.options.timeoutMs)}ms timeout`, {
        timeoutMs: this.options.timeoutMs,
        ...this.diagnostics(result),
      });
    }
    if (result.exitCode !== 0) {
      throw new WorkerError("BLENDER_EXIT_ERROR", "Blender exited with a non-zero status", this.diagnostics(result));
    }
  }

  private async readOutput(outputPath: string): Promise<unknown> {
    let size: number;
    try {
      size = (await stat(outputPath)).size;
    } catch {
      throw new WorkerError("INVALID_BLENDER_OUTPUT", "Blender finished without producing a result file", {
        reason: "missing_output",
      });
    }
    if (size > this.options.maxResultBytes) {
      throw new WorkerError("OUTPUT_TOO_LARGE", "Blender result exceeds the allowed size", {
        sizeBytes: size,
        maxBytes: this.options.maxResultBytes,
      });
    }

    const handle = await open(outputPath, "r");
    try {
      const text = await handle.readFile({ encoding: "utf8" });
      return JSON.parse(text) as unknown;
    } catch {
      throw new WorkerError("INVALID_BLENDER_OUTPUT", "Blender result is not valid JSON", { reason: "malformed_json" });
    } finally {
      await handle.close();
    }
  }

  private validate(raw: unknown, correlationId: string): InspectReport {
    const parsed = inspectReportSchema.safeParse(raw);
    if (!parsed.success) {
      throw new WorkerError("INVALID_BLENDER_OUTPUT", "Blender result does not match the inspect contract", {
        reason: "schema_mismatch",
        issues: parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      });
    }
    const report = parsed.data;
    if (report.correlationId !== correlationId || report.objectCount !== report.objectNames.length) {
      throw new WorkerError("INVALID_BLENDER_OUTPUT", "Blender result is internally inconsistent", {
        reason: "inconsistent_output",
      });
    }
    return report;
  }
}
