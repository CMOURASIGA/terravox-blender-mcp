# B5 - SECURITY, OBSERVABILITY & PRODUCTION READINESS

Modelo recomendado: GPT-6 Astra
Esforço: MEDIUM

## Objetivo

Endurecer o serviço antes de permitir assets reais do TerraVox.

## Implementar/revisar

- auth;
- rate limiting;
- request IDs;
- correlation IDs;
- worker identity;
- secrets;
- storage access;
- timeouts;
- max input size;
- path traversal defense;
- allowlists;
- retry policy;
- job retention;
- logs;
- metrics;
- failure classification;
- audit events.

## Threats obrigatórias

- command injection;
- Python injection;
- arbitrary path;
- malicious .blend;
- decompression/resource bombs;
- runaway render;
- storage overwrite;
- SSRF via asset URL;
- credential leakage.

## DoD

Threat model documentado, testes negativos mínimos e runbook de incidentes/falhas.
