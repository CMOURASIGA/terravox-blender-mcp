import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../supabase/migrations/20260922151056_create_blender_jobs.sql",
  import.meta.url,
);

describe("B1 database migration", () => {
  it("enforces RLS, transition validation and an atomic claim", async () => {
    const sql = (await readFile(migrationUrl, "utf8")).toLowerCase();

    expect(sql).toContain("alter table public.blender_jobs enable row level security");
    expect(sql).toContain("revoke all on table public.blender_jobs from public, anon, authenticated");
    expect(sql).toContain("create trigger validate_blender_job_transition");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("update public.blender_jobs as job");
    expect(sql).toContain("lease_expires_at");
    expect(sql).toContain("grant execute on function public.claim_blender_job");
  });
});
