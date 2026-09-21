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

## Correlation

Toda execução deve carregar `correlationId` entre:
- MCP;
- job service;
- worker;
- Blender script;
- logs.
