# B0 - MCP VERCEL FOUNDATION

Modelo recomendado: GPT-5.6 Sol
Esforço: MEDIUM

## Objetivo

Criar o servidor MCP hospedável na Vercel, sem Blender real.

## Implementar

- TypeScript;
- MCP Streamable HTTP;
- endpoint público de MCP;
- health;
- registry inicial de tools;
- schemas de entrada/saída;
- job service fake/in-memory apenas para provar contrato;
- `blender.health`;
- `blender.get_job_status`;
- `blender.export_glb` criando job fake;
- logging estruturado;
- env validation;
- README de deploy.

## Não implementar

- Blender;
- subprocess;
- SSH;
- worker;
- Supabase real;
- storage real.

## DoD

- deploy Vercel READY;
- MCP endpoint acessível;
- cliente MCP consegue listar tools;
- chamada export_glb retorna jobId;
- consulta do job fake funciona;
- typecheck/lint/test/build verdes.

## Human Validation

Provar via cliente MCP:
1. initialize;
2. tools/list;
3. blender.health;
4. blender.export_glb;
5. blender.get_job_status.
