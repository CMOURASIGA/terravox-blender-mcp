import { getEnv } from "../config/env.js";
import { createLogger } from "../lib/logger.js";
import { createSupabaseJobRepository } from "../repositories/supabaseJobRepository.js";
import { AssetResolver } from "./assetResolver.js";
import { loadWorkerConfig } from "./config.js";
import { toWorkerError } from "./errors.js";
import { JobProcessor } from "./jobProcessor.js";
import { detectBlenderVersion } from "./preflight.js";
import { SpawnProcessRunner } from "./processRunner.js";
import { ScriptRegistry } from "./scriptRegistry.js";
import { BlenderWorker } from "./worker.js";
import { WorkspaceManager } from "./workspace.js";

const EXIT_CONFIG = 78;

async function main(): Promise<number> {
  const env = getEnv();
  const config = loadWorkerConfig();
  const logger = createLogger({ component: "blender-worker", workerId: config.workerId });

  const runner = new SpawnProcessRunner();
  const scripts = new ScriptRegistry(config.scriptsDir);
  const assets = new AssetResolver(config.assetsDir);
  const workspaces = new WorkspaceManager(config.workspaceRoot, logger);

  try {
    await scripts.verify();
  } catch (error) {
    logger.error("worker.startup_failed", { reason: error instanceof Error ? error.message : "scripts" });
    return EXIT_CONFIG;
  }

  try {
    const version = await detectBlenderVersion(runner, config.blenderPath);
    logger.info("worker.blender_detected", { blenderVersion: version });
  } catch (error) {
    const workerError = toWorkerError(error);
    logger.error("worker.blender_unavailable", { code: workerError.code, details: workerError.details });
    if (config.requireBlenderAtStartup) return EXIT_CONFIG;
  }

  await workspaces.sweepStale(config.staleWorkspaceMaxAgeMs);

  const repository = createSupabaseJobRepository(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const processor = new JobProcessor({ repository, runner, config, logger, assets, scripts, workspaces });
  const worker = new BlenderWorker({ repository, processor, config, logger });

  let signals = 0;
  const onSignal = (signal: NodeJS.Signals): void => {
    signals += 1;
    if (signals === 1) void worker.shutdown(signal);
    else worker.forceShutdown();
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);

  await worker.run();
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(
      JSON.stringify({
        level: "error",
        event: "worker.fatal",
        errorName: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  },
);
