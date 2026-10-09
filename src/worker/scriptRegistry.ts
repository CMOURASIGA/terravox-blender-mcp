import { access } from "node:fs/promises";
import path from "node:path";
import type { BlenderOperation } from "../domain/job.js";
import { WorkerError } from "./errors.js";

export const ALLOWED_SCRIPT_FILES: readonly string[] = Object.freeze(["inspect.py"]);

const OPERATION_SCRIPTS: Readonly<Partial<Record<BlenderOperation, string>>> = Object.freeze({
  inspect_asset: "inspect.py",
});

export interface ResolvedScript {
  fileName: string;
  absolutePath: string;
}

export class ScriptRegistry {
  constructor(private readonly scriptsDir: string) {}

  forOperation(operation: BlenderOperation): ResolvedScript {
    const fileName = OPERATION_SCRIPTS[operation];
    if (!fileName) {
      throw new WorkerError("OPERATION_NOT_SUPPORTED", `Operation ${operation} is not supported by this worker`, {
        operation,
      });
    }
    return this.resolveFile(fileName);
  }

  resolveFile(fileName: string): ResolvedScript {
    if (!ALLOWED_SCRIPT_FILES.includes(fileName)) {
      throw new WorkerError("SCRIPT_NOT_ALLOWED", "Script is not in the allowlist", { script: fileName.slice(0, 64) });
    }
    return { fileName, absolutePath: path.join(this.scriptsDir, fileName) };
  }

  async verify(): Promise<void> {
    for (const fileName of ALLOWED_SCRIPT_FILES) {
      try {
        await access(this.resolveFile(fileName).absolutePath);
      } catch {
        throw new Error(`Allowlisted Blender script is missing: ${fileName}`);
      }
    }
  }
}
