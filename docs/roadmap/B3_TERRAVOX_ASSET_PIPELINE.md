# B3 - TERRAVOX ASSET PIPELINE

Modelo recomendado: GPT-6 Astra
Esforço: MEDIUM

## Objetivo

Transformar o worker técnico em pipeline de assets compatível com o TerraVox.

## Implementar

Scripts Blender:
- inspect.py;
- validate.py;
- render_preview.py;
- optimize.py;
- export_glb.py.

## Perfil TerraVox inicial

- 1 Blender Unit = 1 metro;
- GLB como formato runtime;
- transforms aplicados;
- nomes previsíveis;
- materials/textures auditáveis;
- animações identificáveis;
- relatório de triangles;
- warnings de texturas grandes;
- asset original preservado.

## Convenções

Prefixos:
- CHR_ character;
- NPC_;
- ENM_ enemy/guardian;
- ENV_;
- PROP_;
- FX_.

Animações:
- Idle;
- Walk;
- Run;
- Attack;
- Hit;
- Victory.

## DoD

Um asset .blend de teste passa por:
inspect -> validate -> preview -> optimize opcional -> export GLB

e o GLB pode ser carregado por Three.js/React Three Fiber.
