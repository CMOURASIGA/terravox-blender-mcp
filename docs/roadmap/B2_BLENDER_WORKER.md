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
