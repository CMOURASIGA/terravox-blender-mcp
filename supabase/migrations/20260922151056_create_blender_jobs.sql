create table public.blender_jobs (
  id uuid primary key,
  operation text not null,
  status text not null default 'queued',
  asset_id text not null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error jsonb,
  attempts integer not null default 0,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,

  constraint blender_jobs_operation_check check (
    operation in ('inspect_asset', 'validate_asset', 'render_preview', 'optimize_asset', 'export_glb')
  ),
  constraint blender_jobs_status_check check (
    status in ('queued', 'processing', 'completed', 'failed', 'cancelled')
  ),
  constraint blender_jobs_asset_id_check check (
    asset_id ~ '^[a-z0-9][a-z0-9-]{2,63}$'
  ),
  constraint blender_jobs_payload_object_check check (jsonb_typeof(payload) = 'object'),
  constraint blender_jobs_result_object_check check (
    result is null or jsonb_typeof(result) = 'object'
  ),
  constraint blender_jobs_error_object_check check (
    error is null or (
      jsonb_typeof(error) = 'object'
      and error ? 'code'
      and error ? 'message'
      and jsonb_typeof(error -> 'code') = 'string'
      and jsonb_typeof(error -> 'message') = 'string'
    )
  ),
  constraint blender_jobs_attempts_check check (attempts >= 0),
  constraint blender_jobs_lease_check check (
    (lease_owner is null and lease_expires_at is null)
    or (lease_owner is not null and lease_expires_at is not null and status = 'processing')
  ),
  constraint blender_jobs_timestamps_check check (
    (status = 'queued' and started_at is null and finished_at is null)
    or (status = 'processing' and started_at is not null and finished_at is null)
    or (status in ('completed', 'failed', 'cancelled') and finished_at is not null)
  ),
  constraint blender_jobs_terminal_data_check check (
    (status <> 'completed' or result is not null)
    and (status <> 'failed' or error is not null)
  )
);

comment on table public.blender_jobs is
  'Persistent control-plane jobs. B1 stores metadata only and never local filesystem paths or secrets.';

create index blender_jobs_queue_idx
  on public.blender_jobs (created_at, id)
  where status = 'queued';

create index blender_jobs_expired_lease_idx
  on public.blender_jobs (lease_expires_at, created_at, id)
  where status = 'processing';

create index blender_jobs_correlation_id_idx
  on public.blender_jobs (correlation_id);

create or replace function public.validate_blender_job_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = new.status then
    return new;
  end if;

  if not (
    (old.status = 'queued' and new.status in ('processing', 'cancelled'))
    or (old.status = 'processing' and new.status in ('completed', 'failed', 'cancelled'))
  ) then
    raise exception 'invalid blender job transition: % -> %', old.status, new.status
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger validate_blender_job_transition
before update of status on public.blender_jobs
for each row execute function public.validate_blender_job_transition();

create or replace function public.set_blender_job_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_blender_job_updated_at
before update on public.blender_jobs
for each row execute function public.set_blender_job_updated_at();

create or replace function public.claim_blender_job(
  p_worker_id text,
  p_lease_seconds integer default 60
)
returns setof public.blender_jobs
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if nullif(btrim(p_worker_id), '') is null then
    raise exception 'worker id is required' using errcode = '22023';
  end if;

  if p_lease_seconds < 5 or p_lease_seconds > 3600 then
    raise exception 'lease seconds must be between 5 and 3600' using errcode = '22023';
  end if;

  return query
  with candidate as (
    select job.id
    from public.blender_jobs as job
    where job.status = 'queued'
       or (job.status = 'processing' and job.lease_expires_at <= now())
    order by
      case when job.status = 'queued' then 0 else 1 end,
      job.created_at,
      job.id
    for update skip locked
    limit 1
  )
  update public.blender_jobs as job
  set status = 'processing',
      attempts = job.attempts + 1,
      started_at = coalesce(job.started_at, now()),
      lease_owner = p_worker_id,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds)
  from candidate
  where job.id = candidate.id
  returning job.*;
end;
$$;

alter table public.blender_jobs enable row level security;

revoke all on table public.blender_jobs from public, anon, authenticated;
grant select, insert, update on table public.blender_jobs to service_role;

revoke all on function public.validate_blender_job_transition() from public, anon, authenticated;
revoke all on function public.set_blender_job_updated_at() from public, anon, authenticated;
revoke all on function public.claim_blender_job(text, integer) from public, anon, authenticated;
grant execute on function public.claim_blender_job(text, integer) to service_role;
