# TerraVox Blender MCP

Control plane MCP do pipeline Blender do TerraVox. O checkpoint B0 implementa somente a fundação TypeScript hospedável na Vercel, com jobs simulados em memória.

## B0 disponível

- MCP Streamable HTTP stateless;
- endpoint `POST /api/mcp`;
- health HTTP em `GET /api/health`;
- tools `blender.health`, `blender.export_glb` e `blender.get_job_status`;
- validação Zod para ambiente e payloads;
- logging JSON estruturado;
- job service fake em memória.

Blender, worker, Supabase, fila e storage real não fazem parte de B0.

## Desenvolvimento

Requer Node.js 20 ou superior.

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

## Arquitetura futura preservada

```text
MCP/API -> Job Service -> Queue/Persistence -> Blender Worker -> Blender CLI
```

Em B0, apenas MCP/API e a interface do Job Service existem. O store em memória pode ser perdido entre instâncias ou reinicializações da função Vercel. Essa limitação é deliberada e será removida em checkpoint posterior.

Consulte [docs/DEPLOYMENT_VERCEL.md](docs/DEPLOYMENT_VERCEL.md) para publicação e Human Validation.
