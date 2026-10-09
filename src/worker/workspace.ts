import { mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { jobIdSchema } from "../domain/job.js";
import type { Logger } from "../lib/logger.js";
import { WorkerError } from "./errors.js";

export interface Workspace {
  dir: string;
  inputPath: string;
  outputPath: string;
}

const WORKSPACE_PREFIX = "job-";
const WORKSPACE_NAME = /^job-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/;

export class WorkspaceManager {
  constructor(
    private readonly root: string,
    private readonly log: Logger,
  ) {}

  async create(jobId: string): Promise<Workspace> {
    const parsed = jobIdSchema.safeParse(jobId);
    if (!parsed.success) throw new WorkerError("WORKSPACE_ERROR", "Invalid job id for workspace");
    try {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      const dir = await mkdtemp(path.join(this.root, `${WORKSPACE_PREFIX}${parsed.data}-`));
      await mkdir(path.join(dir, "input"), { mode: 0o700 });
      await mkdir(path.join(dir, "output"), { mode: 0o700 });
      return {
        dir,
        inputPath: path.join(dir, "input", "input.blend"),
        outputPath: path.join(dir, "output", "result.json"),
      };
    } catch (error) {
      throw new WorkerError("WORKSPACE_ERROR", "Could not create job workspace", {
        fsCode: (error as NodeJS.ErrnoException).code,
      });
    }
  }

  async cleanup(workspace: Workspace): Promise<boolean> {
    if (path.dirname(workspace.dir) !== this.root || !path.basename(workspace.dir).startsWith(WORKSPACE_PREFIX)) {
      this.log.error("worker.workspace_cleanup_refused");
      return false;
    }
    try {
      await rm(workspace.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return true;
    } catch (error) {
      this.log.warn("worker.workspace_cleanup_failed", { fsCode: (error as NodeJS.ErrnoException).code });
      return false;
    }
  }

  async sweepStale(maxAgeMs: number): Promise<number> {
    let removed = 0;
    let names: string[];
    try {
      names = await readdir(this.root);
    } catch {
      return 0;
    }
    for (const name of names) {
      if (!WORKSPACE_NAME.test(name)) continue;
      const dir = path.join(this.root, name);
      try {
        const stats = await stat(dir);
        if (Date.now() - stats.mtimeMs < maxAgeMs) continue;
        await rm(dir, { recursive: true, force: true });
        removed += 1;
      } catch {
        // Ignore individual stale-workspace cleanup failures and continue sweeping.
      }
    }
    if (removed > 0) this.log.info("worker.stale_workspaces_removed", { removed });
    return removed;
  }
}
