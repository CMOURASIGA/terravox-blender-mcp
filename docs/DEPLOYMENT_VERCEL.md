# Vercel Deployment - B0

## Escopo publicado

Vercel hospeda apenas o control plane:

- `POST /api/mcp`, MCP Streamable HTTP stateless;
- `GET /api/health`, diagnóstico HTTP simples;
- registry e validação das tools;
- job service fake em memória;
- logs estruturados em JSON.

Não são executados Blender, Python, shell, worker, Supabase, fila ou storage real.

## Configuração

O runtime requer Node.js 20 ou superior. Todas as variáveis possuem defaults seguros em B0:

```text
NODE_ENV=production
LOG_LEVEL=info
MCP_SERVER_NAME=terravox-blender-mcp
MCP_SERVER_VERSION=0.1.0
```

Copie `.env.example` somente para desenvolvimento local. B0 não possui segredos.

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
4. chamar `blender.export_glb` e guardar o `jobId`;
5. na mesma instância aquecida, consultar `blender.get_job_status` e confirmar `completed` e `simulated: true`.

## Limitação deliberada de B0

O store é global e em memória. A Vercel pode atender chamadas em instâncias diferentes ou reciclar uma instância, portanto um job fake pode deixar de ser encontrado. Isso não é persistência e não deve ser tratado como comportamento de produção. Persistência, claim/lease e worker pertencem a checkpoints posteriores.
