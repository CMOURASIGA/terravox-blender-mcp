# B2 - Blender Worker Runbook (Linux)

O Worker roda **somente em Linux persistente** (nunca na Vercel). A Vercel continua sendo MCP/API/control plane.

## 1. Instalar Blender

Opção A (validada nos testes automatizados do B2, Ubuntu 24.04): `sudo apt-get install -y --no-install-recommends blender` → Blender 4.0.2, binário `/usr/bin/blender`.

Opção B (versão fixa oficial): baixar o tarball Linux x64 de https://download.blender.org/release/ , extrair em `/opt/blender-<versão>/` e usar `BLENDER_PATH=/opt/blender-<versão>/blender`. O binário é autocontido.

Verificar: `blender --version`.

## 2. Instalar o Worker

```bash
sudo useradd --system --home /var/lib/terravox-blender-worker --shell /usr/sbin/nologin terravox
sudo git clone https://github.com/CMOURASIGA/terravox-blender-mcp.git /opt/terravox-blender-mcp
cd /opt/terravox-blender-mcp && sudo git checkout <branch/sha do B2>
sudo npm ci && sudo npm run build
sudo npm run asset:cube   # fixture técnico B2; gera assets/blender/cube.blend localmente
sudo chown -R root:root /opt/terravox-blender-mcp   # código somente leitura para o serviço
```

## 3. Configurar e subir com systemd

```bash
sudo cp deploy/systemd/terravox-blender-worker.env.example /etc/terravox-blender-worker.env
sudo chmod 600 /etc/terravox-blender-worker.env && sudo nano /etc/terravox-blender-worker.env   # SUPABASE_*
sudo cp deploy/systemd/terravox-blender-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now terravox-blender-worker
journalctl -u terravox-blender-worker -f
```

Execução manual (sem systemd): `node --env-file=.env dist/src/worker/main.js` (ou `npm run worker:start` com as variáveis exportadas).

Exit code 78 = configuração inválida (Blender ou scripts ausentes). O systemd **não** reinicia nesse caso (`RestartPreventExitStatus=78`).

## 4. E2E real (cube-test)

Com o worker rodando:

```bash
node --env-file=.env dist/scripts/e2e-cube.js
```

O fixture `cube.blend` é gerado deterministicamente por `npm run asset:cube` e não precisa ser versionado como binário. O script cria um job `inspect_asset` / `assetId: cube-test`, espera `completed` e valida que o `result` contém os dados reais do `cube.blend` (1 objeto `Cube`, 1 mesh, 2×2×2 m, mesmo `correlationId`). Sai com código ≠ 0 se algo divergir.

## 5. Variáveis de ambiente

| Variável | Default | Descrição |
|---|---|---|
| `SUPABASE_URL` | - (obrigatória) | URL HTTPS do projeto |
| `SUPABASE_SERVICE_ROLE_KEY` | - (obrigatória) | Segredo server-side; nunca repassado ao Blender |
| `LOG_LEVEL` | `info` | debug/info/warn/error |
| `WORKER_ID` | `<hostname>-<pid>` | Identidade usada como `lease_owner` |
| `WORKER_POLL_INTERVAL_MS` | 2000 | Intervalo de polling com fila vazia |
| `WORKER_LEASE_SECONDS` | 60 | Duração da lease (5–3600) |
| `WORKER_HEARTBEAT_INTERVAL_MS` | 15000 | Deve ser < metade da lease |
| `WORKER_MAX_ATTEMPTS` | 3 | Máximo de tentativas por job |
| `WORKER_RETRY_DELAY_MS` | 5000 | Espera antes de nova tentativa |
| `WORKER_SHUTDOWN_GRACE_MS` | 30000 | Tempo para terminar o job em SIGTERM |
| `WORKER_WORKSPACE_ROOT` | `$TMPDIR/terravox-blender-worker` | Raiz dos workspaces por job |
| `WORKER_REQUIRE_BLENDER_AT_STARTUP` | true | Aborta (exit 78) se Blender indisponível |
| `BLENDER_PATH` | `blender` | Nome de comando ou caminho absoluto |
| `BLENDER_TIMEOUT_MS` | 120000 | Timeout obrigatório por execução |
| `BLENDER_KILL_GRACE_MS` | 3000 | SIGTERM → SIGKILL |
| `BLENDER_MAX_OUTPUT_BYTES` | 262144 | Limite por stream (stdout/stderr) |
| `BLENDER_MAX_RESULT_BYTES` | 1048576 | Limite do JSON do script |
| `BLENDER_ASSETS_DIR` | `assets/blender` | Relativo ao `WorkingDirectory` |
| `BLENDER_SCRIPTS_DIR` | `tools/blender` | Relativo ao `WorkingDirectory` |

## 6. Operação

- Concorrência = 1 por processo (B2). Múltiplos workers são seguros graças ao `SKIP LOCKED` + lease. Renovação, finalização e liberação exigem ownership e lease ainda válida; lease expirada não é reanimada pelo worker antigo. Múltiplos workers ainda não foram homologados em B2.
- Jobs de operações ainda não suportadas (`export_glb`, `validate_asset`, ...) são claimados e falham com `OPERATION_NOT_SUPPORTED` (auditável). Isso inclui os jobs simulados criados por `blender.export_glb` do B1 - esperado até o B3.
