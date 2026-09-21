# B1 - JOB QUEUE & CONTRACTS

Modelo recomendado: GPT-5.6 Sol
Esforço: MEDIUM

## Objetivo

Trocar o job fake por persistência real e contrato assíncrono.

## Recomendação

Supabase/Postgres na primeira versão.

## Implementar

- migration `blender_jobs`;
- repository;
- create/get/update;
- claim/lease seguro;
- retry fields;
- correlationId;
- índices;
- status validation;
- MCP integrado ao repository.

## Segurança

Vercel usa credencial server-side.

Worker terá credencial própria e mínimo privilégio possível.

## DoD

- job persiste entre requests;
- dois consumers não processam o mesmo job;
- transitions inválidas são rejeitadas;
- testes de concorrência do claim;
- Vercel continua sem Blender.
