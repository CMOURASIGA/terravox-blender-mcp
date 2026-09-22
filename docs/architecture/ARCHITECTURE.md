# Architecture - TerraVox Blender MCP

## 1. Contexto

O TerraVox utiliza React Three Fiber/Three.js e precisa de um pipeline de assets 3D que reduza geração manual de geometria em código.

Blender será usado como fábrica de assets e automação 3D.

## 2. Componentes

### A. MCP Server - Vercel

Responsabilidades:
- endpoint MCP Streamable HTTP;
- autenticação/autorização;
- schemas;
- tool registry;
- criação de jobs;
- consulta de status;
- retorno de metadados/resultados.

Não executa Blender.

### B. Job Store

Primeira opção recomendada: Supabase/Postgres.

Tabela conceitual `blender_jobs`:
- id;
- type;
- status;
- asset_id;
- payload;
- result;
- error;
- created_at;
- started_at;
- finished_at;
- attempts;
- correlation_id.

No B1, a tabela também mantém `updated_at`, `lease_owner` e `lease_expires_at` como metadados internos. O MCP não expõe os campos de lease. O claim usa uma função Postgres atômica com row lock e `SKIP LOCKED`; isso evita que dois consumers recebam o mesmo job sem criar um worker antecipadamente.

Estados:
- queued;
- processing;
- completed;
- failed;
- cancelled.

### C. Blender Worker

Serviço Linux persistente.

Responsabilidades:
- buscar jobs pendentes;
- fazer claim seguro;
- preparar workspace temporário;
- localizar asset permitido;
- executar Blender headless;
- executar scripts Python versionados;
- coletar stdout/stderr;
- produzir artefatos;
- atualizar job;
- limpar temporários.

### D. Blender

Execução esperada:

```bash
blender --background input.blend --python tools/blender/<script>.py -- <args-seguros>
```

Scripts autorizados:
- inspect.py
- validate.py
- render_preview.py
- optimize.py
- export_glb.py

### E. Artifact Storage

Não decidir fornecedor em B0.

Contrato precisa suportar:
- source .blend;
- preview .png/.webp;
- output .glb;
- report .json.

O storage pode ser implementado posteriormente com Supabase Storage, object storage ou artefatos de CI.

## 3. Fluxo

```text
1. Work chama blender.export_glb
2. MCP valida assetId/opções
3. Job Service cria job queued
4. MCP retorna jobId
5. Worker faz claim
6. Worker executa export_glb.py
7. Worker salva artefato
8. Worker atualiza completed
9. Work chama blender.get_job_status
10. MCP devolve metadados do output
```

## 4. Segurança

Nunca aceitar:
- path absoluto arbitrário;
- shell command;
- código Python;
- URL sem allowlist;
- script escolhido livremente;
- flags Blender arbitrárias.

Usar:
- assetId;
- operation enum;
- opções tipadas;
- workspaces isolados;
- limite de tamanho;
- timeout;
- allowlist de scripts.

## 5. Asset identity

A API trabalha com `assetId`, não com caminho livre.

Exemplo:

```json
{
  "assetId": "chr-explorer-v001",
  "operation": "export_glb"
}
```

A resolução assetId -> localização física pertence ao backend.

## 6. Escalabilidade

Inicialmente:
- 1 worker;
- concorrência baixa;
- polling controlado.

Depois:
- múltiplos workers;
- lease/claim;
- retry;
- dead-letter;
- prioridades.

## 7. Não objetivos iniciais

- modelagem autônoma completa;
- edição arbitrária da cena;
- render farm;
- multiplayer;
- geração de assets por prompt;
- interface web de DCC.

Primeiro provar pipeline determinístico e seguro.
