# TerraVox Blender MCP

MCP e pipeline de automação do Blender para o TerraVox.

## Objetivo

Permitir que ChatGPT Work/Codex acione tarefas controladas de Blender sem executar Blender dentro da Vercel.

Arquitetura:

```text
ChatGPT Work / Codex
        |
        v
Vercel MCP Server
control plane
        |
        v
Job Queue / persistence
        |
        v
Blender Worker
Linux + Blender headless
        |
        v
.blend -> validate -> preview -> optimize -> .glb
        |
        v
TerraVox / storage / GitHub
```

## Regra central

**Vercel não executa Blender.**

Vercel hospeda:
- endpoint MCP;
- autenticação;
- validação de payload;
- criação/consulta de jobs;
- respostas das tools.

O Blender Worker executa:
- Blender headless;
- scripts Python;
- inspeção de cenas;
- validação;
- preview;
- otimização;
- export GLB.

## Branches

- `main`: baseline estável/documentação aprovada.
- `develop`: implementação corrente.

## Roadmap

- B0 - MCP Vercel Foundation
- B1 - Job Queue & Contracts
- B2 - Blender Worker
- B3 - TerraVox Asset Pipeline
- B4 - ChatGPT Work / MCP Plugin Integration
- B5 - Security, Observability & Production Readiness

Leia antes de implementar:
- `AGENTS.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/roadmap/EXECUTION_MATRIX.md`

## Primeiro objetivo técnico

O primeiro E2E não usa personagem nem cenário.

Usar um `cube.blend` de teste:

```text
MCP -> create job -> Blender Worker -> render preview -> export GLB -> job completed
```

Somente depois deste fluxo ser homologado o projeto deve processar assets reais do TerraVox.
