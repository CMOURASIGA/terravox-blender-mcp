# B4 - CHATGPT WORK / MCP PLUGIN INTEGRATION

Modelo recomendado: GPT-5.6 Sol
Esforço: MEDIUM

## Objetivo

Conectar o MCP publicado ao cliente compatível do ChatGPT/Codex e validar uso conversacional.

## Pré-requisitos

- B0-B3 homologadas;
- endpoint HTTPS;
- autenticação definida;
- tools estáveis;
- worker disponível.

## Validar

- discovery/listagem das tools;
- autorização;
- chamada de health;
- criação de job;
- polling de status;
- retorno de preview;
- retorno de export GLB;
- mensagens de erro claras.

## Cenário E2E

Pedido:

"Valide o asset cube-test e exporte um GLB."

Resultado esperado:
- inspect/validate quando necessário;
- job assíncrono;
- output GLB;
- metadados;
- sem shell arbitrário.

## Observação

A disponibilidade de conexão MCP no produto ChatGPT depende dos recursos habilitados para a conta/ambiente. A arquitetura deste projeto não deve depender exclusivamente de uma UI específica do ChatGPT.
