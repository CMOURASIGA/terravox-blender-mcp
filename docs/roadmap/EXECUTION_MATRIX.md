# Execution Matrix

| Checkpoint | Entrega | Modelo | Esforço |
|---|---|---|---|
| B0 | MCP Vercel Foundation | GPT-5.6 Sol | MEDIUM |
| B1 | Job Queue & Contracts | GPT-5.6 Sol | MEDIUM |
| B2 | Blender Worker | GPT-6 Astra | HIGH |
| B3 | TerraVox Asset Pipeline | GPT-6 Astra | MEDIUM |
| B4 | ChatGPT Work / MCP Integration | GPT-5.6 Sol | MEDIUM |
| B5 | Security & Production Readiness | GPT-6 Astra | MEDIUM |

## Ordem obrigatória

B0 -> B1 -> B2 -> B3 -> B4 -> B5

Não executar múltiplos checkpoints em uma única tarefa do Codex.

## Modelo

### GPT-5.6 Sol

Usar para:
- TypeScript delimitado;
- MCP schemas;
- CRUD/repository;
- testes;
- documentação;
- integração previsível;
- configuração Vercel.

### GPT-6 Astra

Usar para:
- process isolation;
- worker lifecycle;
- concorrência;
- Blender CLI/Python pipeline;
- segurança de execução;
- investigação de performance;
- refatoração transversal.

## Thinking effort

B0: Sol MEDIUM
B1: Sol MEDIUM
B2: Astra HIGH
B3: Astra MEDIUM
B4: Sol MEDIUM
B5: Astra MEDIUM

Subir para HIGH somente diante de blocker técnico real.

## Política de consumo

Não usar Astra para:
- README;
- labels;
- boilerplate simples;
- ajustes de endpoint;
- copy;
- refatorações locais triviais.

O objetivo é concentrar Astra nos pontos em que o raciocínio arquitetural e operacional reduz risco real.
