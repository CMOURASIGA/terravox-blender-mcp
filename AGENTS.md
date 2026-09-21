# AGENTS.md - Codex Instructions

Este repositório implementa o control plane MCP e o worker Blender do TerraVox.

## Regras obrigatórias

1. Leia a SPEC do checkpoint antes de alterar código.
2. Implemente somente o checkpoint autorizado.
3. Não execute Blender dentro da Vercel.
4. Não aceite comandos shell ou Python arbitrários vindos do MCP.
5. Tools MCP devem mapear para operações fechadas e previamente autorizadas.
6. Toda entrada externa deve ser validada por schema.
7. Jobs pesados devem ser assíncronos.
8. Nenhum segredo deve ser enviado ao client.
9. O Worker deve ser substituível e não depender da Vercel.
10. Não acople este repositório ao frontend do TerraVox.
11. O resultado primário do pipeline é GLB/GLTF compatível com React Three Fiber.
12. Falhas devem produzir estado de job e erro auditável, não apenas logs soltos.

## Arquitetura obrigatória

```text
MCP/API
  -> Job Service
     -> Queue/Persistence
        -> Blender Worker
           -> Blender CLI/Python
```

Não implementar Blender diretamente dentro de uma Vercel Function.

## Tool policy

Permitido como primeira versão:
- blender.health
- blender.inspect_asset
- blender.validate_asset
- blender.render_preview
- blender.optimize_asset
- blender.export_glb
- blender.get_job_status

Proibido:
- blender.run_shell
- blender.run_python
- eval
- arbitrary command execution
- arbitrary filesystem path supplied pelo usuário

## Git

Trabalhar em branch derivada de `develop`.

Formato recomendado:
- `feat/b0-mcp-foundation`
- `feat/b1-job-queue`
- `feat/b2-blender-worker`

Antes de concluir:
- typecheck;
- lint;
- tests;
- build;
- registrar decisões relevantes na documentação.

## Model routing

Use GPT-5.6 Sol para implementação delimitada, API, schemas, testes e documentação.

Use GPT-6 Astra quando o checkpoint envolver arquitetura transversal, worker/process management, isolamento de processos, concorrência, segurança de execução ou investigação de falhas complexas.

Não desperdiçar Astra em ajustes cosméticos ou boilerplate previsível.
