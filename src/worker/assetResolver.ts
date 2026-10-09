import { copyFile, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { assetIdSchema } from "../domain/job.js";
import { WorkerError } from "./errors.js";

export interface AssetDefinition {
  assetId: string;
  /** File name inside the assets directory. Never a path. */
  fileName: string;
}

/**
 * Closed catalog: assetId -> physical file. B2 ships exactly one asset.
 * Adding an asset is a code change reviewed in the repository, never job input.
 */
export const ASSET_CATALOG: readonly AssetDefinition[] = Object.freeze([
  Object.freeze({ assetId: "cube-test", fileName: "cube.blend" }),
]);

export interface ResolvedAsset {
  assetId: string;
  /** Internal absolute path. Must never be persisted in job results. */
  sourcePath: string;
  sizeBytes: number;
}

export class AssetResolver {
  private readonly byId: ReadonlyMap<string, AssetDefinition>;

  constructor(
    private readonly assetsDir: string,
    catalog: readonly AssetDefinition[] = ASSET_CATALOG,
  ) {
    const entries = new Map<string, AssetDefinition>();
    for (const entry of catalog) {
      if (entry.fileName !== path.basename(entry.fileName) || !entry.fileName.endsWith(".blend")) {
        throw new Error(`Invalid asset catalog entry for ${entry.assetId}`);
      }
      entries.set(entry.assetId, entry);
    }
    this.byId = entries;
  }

  async resolve(rawAssetId: string): Promise<ResolvedAsset> {
    const parsed = assetIdSchema.safeParse(rawAssetId);
    const definition = parsed.success ? this.byId.get(parsed.data) : undefined;
    if (!parsed.success || !definition) {
      throw new WorkerError("ASSET_NOT_FOUND", "Asset is not registered", { reason: "unknown_asset_id" });
    }

    try {
      const root = await realpath(this.assetsDir);
      const candidate = await realpath(path.join(root, definition.fileName));
      if (path.dirname(candidate) !== root) {
        throw new WorkerError("ASSET_NOT_FOUND", "Asset resolves outside the assets directory", {
          reason: "outside_assets_dir",
        });
      }
      const stats = await lstat(candidate);
      if (!stats.isFile()) {
        throw new WorkerError("ASSET_NOT_FOUND", "Asset is not a regular file", { reason: "not_a_file" });
      }
      return { assetId: definition.assetId, sourcePath: candidate, sizeBytes: stats.size };
    } catch (error) {
      if (error instanceof WorkerError) throw error;
      throw new WorkerError("ASSET_NOT_FOUND", "Asset file does not exist", { reason: "file_missing" });
    }
  }

  /** Copies the asset into the job workspace; Blender never touches the original. */
  async stage(asset: ResolvedAsset, destination: string): Promise<void> {
    try {
      await copyFile(asset.sourcePath, destination, 1 /* COPYFILE_EXCL */);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        throw new WorkerError("ASSET_NOT_FOUND", "Asset file does not exist", { reason: "file_missing" });
      }
      throw new WorkerError("WORKSPACE_ERROR", "Could not stage asset in workspace", { fsCode: code });
    }
  }
}
