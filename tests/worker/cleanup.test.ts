import { mkdir, readdir, utimes } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeHarness } from "./support/harness.js";

describe("WorkspaceManager", () => {
  it("creates an isolated 0700 workspace per job and removes it", async () => {
    const h = await makeHarness();
    const a = await h.workspaces.create("11111111-1111-4111-8111-111111111111");
    const b = await h.workspaces.create("11111111-1111-4111-8111-111111111111");
    expect(a.dir).not.toBe(b.dir);
    expect((await readdir(h.workspaceRoot)).length).toBe(2);
    expect(await h.workspaces.cleanup(a)).toBe(true);
    expect(await h.workspaces.cleanup(b)).toBe(true);
    expect(await h.workspaceDirs()).toEqual([]);
  });

  it("rejects job ids that are not UUIDs", async () => {
    const h = await makeHarness();
    await expect(h.workspaces.create("../../etc")).rejects.toMatchObject({ code: "WORKSPACE_ERROR" });
  });

  it("refuses to delete directories outside the workspace root", async () => {
    const h = await makeHarness();
    const outside = path.join(h.base, "job-keep-me");
    await mkdir(outside);
    expect(await h.workspaces.cleanup({ dir: outside, inputPath: "", outputPath: "" })).toBe(false);
    expect(await readdir(h.base)).toContain("job-keep-me");
  });

  it("sweeps only stale, correctly named workspaces", async () => {
    const h = await makeHarness();
    const stale = await h.workspaces.create("22222222-2222-4222-8222-222222222222");
    const fresh = await h.workspaces.create("33333333-3333-4333-8333-333333333333");
    const old = new Date(Date.now() - 2 * 3_600_000);
    await utimes(stale.dir, old, old);
    await mkdir(path.join(h.workspaceRoot, "unrelated-dir"));
    expect(await h.workspaces.sweepStale(3_600_000)).toBe(1);
    const left = await readdir(h.workspaceRoot);
    expect(left).toContain(path.basename(fresh.dir));
    expect(left).toContain("unrelated-dir");
    expect(left).not.toContain(path.basename(stale.dir));
  });
});
