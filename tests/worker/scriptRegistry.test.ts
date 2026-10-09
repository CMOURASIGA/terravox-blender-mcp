import { describe, expect, it } from "vitest";
import { WorkerError } from "../../src/worker/errors.js";
import { ScriptRegistry } from "../../src/worker/scriptRegistry.js";

const registry = new ScriptRegistry("/srv/app/tools/blender");

describe("ScriptRegistry allowlist", () => {
  it("maps inspect_asset to inspect.py", () => {
    expect(registry.forOperation("inspect_asset").absolutePath).toBe("/srv/app/tools/blender/inspect.py");
  });

  it.each(["validate_asset", "render_preview", "optimize_asset", "export_glb"] as const)(
    "does not support %s in B2",
    (operation) => {
      expect(() => registry.forOperation(operation)).toThrowError(
        expect.objectContaining({ code: "OPERATION_NOT_SUPPORTED" }) as WorkerError,
      );
    },
  );

  it.each(["evil.py", "../inspect.py", "/etc/passwd", "inspect.py ", "inspect.PY", "validate.py", "render_preview.py"])(
    "rejects script %j outside the allowlist",
    (name) => {
      expect(() => registry.resolveFile(name)).toThrowError(
        expect.objectContaining({ code: "SCRIPT_NOT_ALLOWED" }) as WorkerError,
      );
    },
  );
});
