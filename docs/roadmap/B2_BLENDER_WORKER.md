# B2 - BLENDER WORKER

Modelo recomendado: GPT-6 Astra
Esforço: HIGH

## Objetivo

Criar o primeiro worker Linux capaz de executar Blender headless com isolamento e contrato previsível.

## Implementar

- worker process;
- polling/claim;
- heartbeat;
- workspace por job;
- process runner;
- timeout;
- stdout/stderr capture;
- allowlist de scripts;
- cleanup;
- structured result;
- retry controlado;
- graceful shutdown.

## Primeiro asset

`cube.blend`.

## Primeiro script

`inspect.py`.

Depois:
- render_preview.py;
- export_glb.py.

## Segurança

Nunca executar payload como shell.

Nunca executar Python recebido do MCP.

Scripts são versionados no repositório e selecionados por enum interno.

## DoD

```text
queued
 -> worker claim
 -> Blender headless
 -> report
 -> completed
```

e falha controlada para timeout/asset inexistente/Blender error.

## Decisões de implementação (B2)

- Worker Node/TypeScript em `src/worker/`, concorrência 1, polling fixo com backoff exponencial em erro de claim.
- Sem migration nova: heartbeat/finish/release usam `UPDATE` guardado por `status='processing'`, `lease_owner=<worker>` e lease ainda não expirada. Uma lease vencida nunca pode ser reanimada pelo worker antigo; zero linhas afetadas = `LEASE_LOST`.
- Blender: `--background --factory-startup --disable-autoexec --python-exit-code 1 <input.blend> --python <allowlist> -- --output <json> --correlation-id <uuid>`; `spawn` sem shell, grupo de processos próprio, SIGTERM → SIGKILL; ambiente mínimo sem segredos; `HOME`/`TMPDIR` apontam para o workspace.
- Asset copiado para o workspace (o original nunca é aberto pelo Blender). Catálogo fechado `cube-test → assets/blender/cube.blend`.
- `inspect.py` grava JSON em arquivo (não depende de parse de stdout) e nunca emite caminhos locais; o Worker valida com schema Zod, `correlationId` e consistência de contagens.
- stdout/stderr são capturados (limite por stream), sanitizados e só aparecem em `error.details` de falhas.
- Startup: valida scripts e `blender --version`; falha → exit 78 (sem loop de restart no systemd).
- Fora de escopo preservado: render_preview, export_glb, upload, storage, B3.
