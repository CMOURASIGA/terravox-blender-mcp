# Vercel Deployment

## O que vai para Vercel

- MCP HTTP endpoint;
- tool registry;
- auth;
- schema validation;
- job creation/query;
- health;
- orchestration leve.

## O que NÃO vai para Vercel

- Blender executable;
- render;
- GLB processing pesado;
- subprocess de longa duração;
- filesystem persistente de assets;
- worker loop.

## Env vars previstas

Nomes finais podem mudar durante B0/B1.

```text
APP_ENV=
MCP_AUTH_SECRET=
JOB_DATABASE_URL=
JOB_DATABASE_SERVICE_KEY=
WORKER_SHARED_SECRET=
LOG_LEVEL=
```

Nunca expor segredos com prefixos públicos de frontend.

## Deploy strategy

- `main`: produção/estável.
- `develop`: preview/staging quando configurado.
- feature branches: preview Vercel.

## Health

Separar:
- MCP server health;
- database health;
- worker heartbeat.

MCP estar online não significa Blender estar disponível.
