import { afterEach, describe, expect, it } from "vitest";
import { assetIdSchema } from "../src/domain/job.js";
import { InMemoryJobService } from "../src/services/inMemoryJobService.js";

describe("B0 in-memory job service", () => {
  const service = new InMemoryJobService();

  afterEach(() => service.clear());

  it("creates a contract-compatible fake export job", () => {
    const job = service.createFakeExport({
      assetId: "chr-explorer-v001",
      exportProfile: "terravox-default",
    });

    expect(job.operation).toBe("export_glb");
    expect(job.status).toBe("completed");
    expect(job.result).toMatchObject({ simulated: true });
    expect(service.getById(job.id)).toEqual(job);
  });

  it("does not accept filesystem paths as asset identifiers", () => {
    expect(assetIdSchema.safeParse("/tmp/asset.blend").success).toBe(false);
    expect(assetIdSchema.safeParse("chr-explorer-v001").success).toBe(true);
  });
});
