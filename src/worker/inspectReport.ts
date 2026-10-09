import { z } from "zod";

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const name = z.string().max(256);
const count = z.int().nonnegative();

export const inspectReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    correlationId: z.uuid(),
    blenderVersion: z.string().min(1).max(64),
    sceneName: name,
    objectCount: count,
    meshCount: count,
    materialCount: count,
    triangleCount: count,
    objectNames: z.array(name).max(10_000),
    materialNames: z.array(name).max(10_000),
    objects: z
      .array(z.object({ name, type: z.string().max(32), dimensions: vec3.nullable(), location: vec3 }).strict())
      .max(10_000),
    dimensions: vec3.nullable(),
  })
  .strict();

export type InspectReport = z.infer<typeof inspectReportSchema>;
