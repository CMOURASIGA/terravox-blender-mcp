import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  blenderJobSchema,
  InvalidJobTransitionError,
  type BlenderJob,
} from "../domain/job.js";
import type {
  ClaimOptions,
  CreateJobRecord,
  JobRepository,
  JobStateUpdate,
  JobStoreHealth,
  LeaseRelease,
  LeaseRenewal,
  OwnedOutcome,
} from "./jobRepository.js";

interface BlenderJobRow {
  id: string;
  operation: string;
  status: string;
  asset_id: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: { code: string; message: string; details?: Record<string, unknown> } | null;
  attempts: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  correlation_id: string;
}

function toJob(row: BlenderJobRow): BlenderJob {
  return blenderJobSchema.parse({
    id: row.id,
    operation: row.operation,
    status: row.status,
    assetId: row.asset_id,
    payload: row.payload,
    result: row.result,
    error: row.error,
    attempts: row.attempts,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    correlationId: row.correlation_id,
  });
}

function databaseError(operation: string, error: { message: string; code?: string }): Error {
  return new Error(`Blender job database ${operation} failed (${error.code ?? "UNKNOWN"}): ${error.message}`);
}

export class SupabaseJobRepository implements JobRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(input: CreateJobRecord): Promise<BlenderJob> {
    const { data, error } = await this.client
      .from("blender_jobs")
      .insert({
        id: input.id,
        operation: input.operation,
        status: "queued",
        asset_id: input.assetId,
        payload: input.payload,
        correlation_id: input.correlationId,
      })
      .select("*")
      .single<BlenderJobRow>();

    if (error) throw databaseError("create", error);
    return toJob(data);
  }

  async getById(jobId: string): Promise<BlenderJob | null> {
    const { data, error } = await this.client
      .from("blender_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle<BlenderJobRow>();

    if (error) throw databaseError("read", error);
    return data ? toJob(data) : null;
  }

  async updateState(jobId: string, update: JobStateUpdate): Promise<BlenderJob> {
    const changes: Record<string, unknown> = { status: update.to };
    if (update.to === "processing") changes.started_at = new Date().toISOString();
    if (["completed", "failed", "cancelled"].includes(update.to)) {
      changes.finished_at = new Date().toISOString();
      changes.lease_owner = null;
      changes.lease_expires_at = null;
    }
    if (update.result !== undefined) changes.result = update.result;
    if (update.error !== undefined) changes.error = update.error;

    const { data, error } = await this.client
      .from("blender_jobs")
      .update(changes)
      .eq("id", jobId)
      .eq("status", update.from)
      .select("*")
      .maybeSingle<BlenderJobRow>();

    if (error) throw databaseError("update", error);
    if (!data) throw new InvalidJobTransitionError(update.from, update.to);
    return toJob(data);
  }

  async claimNext(options: ClaimOptions): Promise<BlenderJob | null> {
    const response = await this.client.rpc("claim_blender_job", {
      p_worker_id: options.workerId,
      p_lease_seconds: options.leaseSeconds,
    });

    if (response.error) throw databaseError("claim", response.error);
    const rows = response.data as BlenderJobRow[] | null;
    return rows?.[0] ? toJob(rows[0]) : null;
  }

  async renewLease(jobId: string, options: LeaseRenewal): Promise<boolean> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("blender_jobs")
      .update({ lease_expires_at: new Date(Date.now() + options.leaseSeconds * 1_000).toISOString() })
      .eq("id", jobId)
      .eq("status", "processing")
      .eq("lease_owner", options.workerId)
      .gt("lease_expires_at", now)
      .select("id");

    if (error) throw databaseError("renew lease", error);
    return data.length > 0;
  }

  async finishOwned(jobId: string, workerId: string, outcome: OwnedOutcome): Promise<boolean> {
    const changes: Record<string, unknown> = {
      status: outcome.status,
      finished_at: new Date().toISOString(),
      lease_owner: null,
      lease_expires_at: null,
    };
    if (outcome.status === "completed") {
      changes.result = outcome.result;
      changes.error = null;
    } else {
      changes.error = outcome.error;
    }

    const { data, error } = await this.client
      .from("blender_jobs")
      .update(changes)
      .eq("id", jobId)
      .eq("status", "processing")
      .eq("lease_owner", workerId)
      .gt("lease_expires_at", new Date().toISOString())
      .select("id");

    if (error) throw databaseError("finish", error);
    return data.length > 0;
  }

  async releaseLease(jobId: string, workerId: string, release: LeaseRelease): Promise<boolean> {
    const expiresAt = release.retryAfterMs > 0 ? new Date(Date.now() + release.retryAfterMs) : new Date(0);
    const changes: Record<string, unknown> = { lease_expires_at: expiresAt.toISOString() };
    if (release.error) changes.error = release.error;

    const { data, error } = await this.client
      .from("blender_jobs")
      .update(changes)
      .eq("id", jobId)
      .eq("status", "processing")
      .eq("lease_owner", workerId)
      .gt("lease_expires_at", new Date().toISOString())
      .select("id");

    if (error) throw databaseError("release lease", error);
    return data.length > 0;
  }

  async health(): Promise<JobStoreHealth> {
    const { error } = await this.client.from("blender_jobs").select("id").limit(1);
    if (error) throw databaseError("health check", error);
    return { type: "supabase-postgres", status: "ok" };
  }
}

export function createSupabaseJobRepository(url: string, serviceRoleKey: string): JobRepository {
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "X-Client-Info": "terravox-blender-mcp" } },
  });
  return new SupabaseJobRepository(client);
}
