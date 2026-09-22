# Blender Job Contract

```ts
type BlenderJobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

type BlenderOperation =
  | "inspect_asset"
  | "validate_asset"
  | "render_preview"
  | "optimize_asset"
  | "export_glb";

interface BlenderJob {
  id: string;
  operation: BlenderOperation;
  status: BlenderJobStatus;
  assetId: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  } | null;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  correlationId: string;
}
```

## Regras

- `queued -> processing -> completed|failed`.
- job não volta de completed para processing.
- retries criam nova tentativa controlada.
- operações devem ser idempotentes quando possível.
- worker deve usar claim/lease quando houver concorrência.
- payload nunca contém segredo.
- result nunca contém caminho local sensível.

## Persistência B1

- `blender.export_glb` cria o job em `queued`, `attempts: 0` e sem timestamps de execução;
- `claim_blender_job` faz claim atômico com `FOR UPDATE SKIP LOCKED`;
- o claim muda para `processing`, incrementa `attempts` e define uma lease limitada;
- uma lease vencida pode ser reclamada atomicamente;
- `lease_owner`, `lease_expires_at` e `updated_at` são internos e não integram a resposta MCP;
- transições inválidas são bloqueadas no serviço e por trigger no Postgres.

## Correlation

Toda execução deve carregar `correlationId` entre:
- MCP;
- job service;
- worker;
- Blender script;
- logs.
