# Vercel Deployment - B1

## Escopo publicado

Vercel hospeda apenas o control plane:

- `POST /api/mcp`, MCP Streamable HTTP stateless;
- `GET /api/health`, diagnóstico HTTP simples;
- registry e validação das tools;
- job service persistente em Supabase/Postgres;
- logs estruturados em JSON.

Não são executados Blender, Python, shell, worker ou storage de artefatos.

## Configuração

O runtime requer Node.js 22 ou superior. Além das variáveis com defaults seguros, B1 exige duas variáveis server-side:

```text
NODE_ENV=production
LOG_LEVEL=info
MCP_SERVER_NAME=terravox-blender-mcp
MCP_SERVER_VERSION=0.1.0
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SEGREDO_SERVER_SIDE
```

`SUPABASE_SERVICE_ROLE_KEY` deve ser configurada como secret no Preview da Vercel. Ela não pode usar prefixo público, aparecer em logs, respostas MCP, código ou documentação com valor real. A tabela tem RLS, sem políticas para `anon` e `authenticated`; somente o backend server-side recebe grants.

Antes do deploy, aplique `supabase/migrations/20260922151056_create_blender_jobs.sql` ao projeto Supabase escolhido.

## Deploy

Conecte o repositório à Vercel e use as configurações automáticas do projeto. A função é descoberta em `api/mcp.ts`; `vercel.json` limita sua duração a 10 segundos. O diretório `public` é mantido para compatibilidade com a configuração de Output Directory do projeto Vercel.

Por CLI:

```bash
npm ci
npm run build
npx vercel
```

## Verificação

Health HTTP:

```bash
curl https://SEU-DOMINIO/api/health
```

MCP Inspector:

```bash
npx @modelcontextprotocol/inspector https://SEU-DOMINIO/api/mcp
```

Fluxo de Human Validation:

1. conectar e confirmar `initialize`;
2. listar tools e confirmar exatamente as três tools de B0;
3. chamar `blender.health` e confirmar worker `not-configured`;
4. chamar `blender.export_glb`, guardar o `jobId` e confirmar `queued` e `simulated: true`;
5. abrir uma nova request e consultar `blender.get_job_status`;
6. confirmar que o mesmo job permanece `queued`, com `attempts: 0` e `payload.simulated: true`;
7. confirmar que nenhuma resposta contém service role, variáveis de ambiente ou lease interno.

## Limitação deliberada de B1

O job é persistente e não depende da instância Vercel. B1 não possui worker, portanto o job não sai de `queued` durante o fluxo público. A RPC interna de claim/lease é atômica e foi preparada para o B2, mas não é exposta como tool MCP.
