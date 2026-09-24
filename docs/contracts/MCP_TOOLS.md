# MCP Tools Contract

## blender.health

Tipo: síncrona.

Retorna:
- MCP status;
- job store status;
- worker heartbeat agregado quando disponível.

## blender.inspect_asset

Entrada:
- assetId.

Saída:
- jobId.

Resultado do job:
- objetos;
- meshes;
- materials;
- textures;
- animations;
- dimensions;
- triangle count;
- warnings.

## blender.validate_asset

Entrada:
- assetId;
- profile opcional, inicialmente `terravox-default`.

Saída:
- jobId.

Resultado:
- valid;
- errors[];
- warnings[];
- metrics.

## blender.render_preview

Entrada:
- assetId;
- preset enum.

Saída:
- jobId.

Resultado:
- preview artifact metadata.

## blender.optimize_asset

Entrada:
- assetId;
- profile enum.

Saída:
- jobId.

Nunca sobrescrever source original silenciosamente.

## blender.export_glb

Entrada:
- assetId;
- exportProfile enum.

Saída:
- jobId.
- status `queued` em B1;
- correlationId;
- `simulated: true` enquanto o worker Blender não existe.

Resultado:
- GLB metadata;
- size;
- validation summary;
- artifact reference.

Em B1, não existe resultado de artefato. A simulação significa que a solicitação é persistida e consultável, não que um GLB fake foi produzido.

## blender.get_job_status

Entrada:
- jobId.

Saída:
- status;
- timestamps;
- progress quando conhecido;
- result se completed;
- structured error se failed.

## Erros MCP

Erros de schema/autorização retornam imediatamente.

Erros de Blender pertencem ao job e devem ser consultáveis pelo status.
