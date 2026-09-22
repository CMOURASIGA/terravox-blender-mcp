# TerraVox Blender MCP

Control plane MCP do pipeline Blender do TerraVox. O checkpoint B1 mantém a simulação da operação Blender, mas grava os jobs em Supabase/Postgres.

## B1 disponível

- MCP Streamable HTTP stateless;
- endpoint `POST /api/mcp`;
- health HTTP em `GET /api/health`;
- tools `blender.health`, `blender.export_glb` e `blender.get_job_status`;
- validação Zod para ambiente e payloads;
- logging JSON estruturado;
- repository persistente de jobs;
- transições de estado validadas no domínio e no banco;
- claim/lease atômico preparado para o worker futuro.

Blender, worker, subprocessos, Python e storage de artefatos não fazem parte de B1.

## Desenvolvimento

Requer Node.js 22 ou superior e um projeto Supabase/Postgres com a migration aplicada.

Copie `.env.example` para `.env.local` e configure, somente no servidor:

```text
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SEGREDO_SERVER_SIDE
```

Nunca use prefixo `NEXT_PUBLIC_` para a service role nem grave seu valor no repositório.

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Para testar o endpoint localmente:

```bash
npx vercel dev
npx @modelcontextprotocol/inspector http://localhost:3000/api/mcp
```

No Inspector, execute na ordem:

1. `initialize` ao conectar;
2. `tools/list`;
3. `blender.health`;
4. `blender.export_glb` com `{"assetId":"chr-explorer-v001","exportProfile":"terravox-default"}`;
5. `blender.get_job_status` com o `jobId` retornado.

## Arquitetura

```text
MCP/API -> Job Service -> Queue/Persistence -> Blender Worker -> Blender CLI
```

Em B1, MCP/API, Job Service e Queue/Persistence estão implementados. `blender.export_glb` cria um job `queued` com `simulated: true`; como ainda não há worker, nenhum job é processado automaticamente. O claim/lease existe apenas como contrato interno para o B2.

Consulte [docs/DEPLOYMENT_VERCEL.md](docs/DEPLOYMENT_VERCEL.md) para publicação e Human Validation.
