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
- renovação, conclusão e liberação exigem `lease_owner` correto **e lease ainda não expirada**; um worker atrasado não pode reanimar nem concluir uma lease vencida;
- `lease_owner`, `lease_expires_at` e `updated_at` são internos e não integram a resposta MCP;
- transições inválidas são bloqueadas no serviço e por trigger no Postgres.

## Correlation

Toda execução deve carregar `correlationId` entre:
- MCP;
- job service;
- worker;
- Blender script;
- logs.

## Worker B2 - resultado e erros

`inspect_asset` (payload obrigatoriamente `{}`; qualquer chave como `command`, `script`, `python`, `args`, `path` é rejeitada com `INVALID_PAYLOAD`).

Resultado `completed`:

```json
{
  "operation": "inspect_asset",
  "assetId": "cube-test",
  "correlationId": "<uuid>",
  "report": {
    "schemaVersion": 1,
    "correlationId": "<uuid>",
    "blenderVersion": "4.0.2",
    "sceneName": "CubeScene",
    "objectCount": 1, "meshCount": 1, "materialCount": 1, "triangleCount": 12,
    "objectNames": ["Cube"], "materialNames": ["CubeMaterial"],
    "objects": [{ "name": "Cube", "type": "MESH", "dimensions": [2, 2, 2], "location": [0, 0, 0] }],
    "dimensions": [2, 2, 2]
  },
  "execution": { "exitCode": 0, "durationMs": 1800, "stdoutTruncated": false, "stderrTruncated": false },
  "worker": { "id": "blender-worker-01", "attempt": 1 }
}
```

Códigos de erro estáveis (`job.error.code`):

| Código | Retry | Significado |
|---|---|---|
| `BLENDER_NOT_FOUND` | não | Executável ausente/sem permissão |
| `ASSET_NOT_FOUND` | não | assetId inválido, não registrado ou arquivo ausente |
| `BLENDER_TIMEOUT` | sim | Excedeu `BLENDER_TIMEOUT_MS` (processo encerrado) |
| `BLENDER_EXIT_ERROR` | sim | Exit code ≠ 0 |
| `INVALID_BLENDER_OUTPUT` | não | JSON ausente/malformado/fora do contrato |
| `OUTPUT_TOO_LARGE` | não | Resultado maior que `BLENDER_MAX_RESULT_BYTES` |
| `INVALID_PAYLOAD` | não | Payload com chaves não aceitas |
| `OPERATION_NOT_SUPPORTED` | não | Operação fora do escopo do B2 |
| `SCRIPT_NOT_ALLOWED` | não | Script fora da allowlist |
| `WORKSPACE_ERROR` | sim | Falha ao criar/preparar workspace |
| `DATABASE_ERROR` | sim | Falha persistente de banco |
| `WORKER_SHUTDOWN` | sim | Worker encerrado durante o processamento (job liberado) |
| `MAX_ATTEMPTS_EXCEEDED` | não | `attempts` > `WORKER_MAX_ATTEMPTS` |
| `LEASE_LOST` | - | Só em log: outro worker é dono; o worker abandona sem escrever |
| `INTERNAL_ERROR` | não | Erro inesperado |

Retry: como `processing -> queued` é proibido pelo trigger, o retry libera a lease (`lease_expires_at` no passado/futuro curto) e o `claim_blender_job` existente reclama o job incrementando `attempts`. O último erro fica gravado em `error` enquanto o job aguarda nova tentativa e é limpo em `completed`.
