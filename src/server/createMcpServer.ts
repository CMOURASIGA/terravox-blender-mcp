import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getEnv } from "../config/env.js";
import { assetIdSchema, exportProfileSchema, jobIdSchema } from "../domain/job.js";
import { logger } from "../lib/logger.js";
import { jobService } from "../services/inMemoryJobService.js";

export const MCP_TOOL_NAMES = [
  "blender.health",
  "blender.export_glb",
  "blender.get_job_status",
] as const;

function toolResult(value: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

export function createMcpServer(): McpServer {
  const env = getEnv();
  const server = new McpServer({
    name: env.MCP_SERVER_NAME,
    version: env.MCP_SERVER_VERSION,
  });

  server.registerTool(
    "blender.health",
    {
      title: "Blender MCP health",
      description: "Reports B0 MCP and fake in-memory job store status.",
      inputSchema: {},
      outputSchema: {
        status: z.literal("ok"),
        server: z.string(),
        version: z.string(),
        jobStore: z.object({ type: z.literal("in-memory"), status: z.literal("ok"), jobs: z.number() }),
        worker: z.object({ status: z.literal("not-configured") }),
      },
    },
    () =>
      toolResult({
        status: "ok",
        server: env.MCP_SERVER_NAME,
        version: env.MCP_SERVER_VERSION,
        jobStore: { type: "in-memory", status: "ok", jobs: jobService.size },
        worker: { status: "not-configured" },
      }),
  );

  server.registerTool(
    "blender.export_glb",
    {
      title: "Create fake GLB export job",
      description: "Creates a completed in-memory B0 simulation job. No Blender process is executed.",
      inputSchema: {
        assetId: assetIdSchema.describe("Backend asset identifier, never a filesystem path."),
        exportProfile: exportProfileSchema.default("terravox-default"),
      },
      outputSchema: {
        jobId: jobIdSchema,
        status: z.literal("completed"),
        correlationId: jobIdSchema,
        simulated: z.literal(true),
      },
    },
    ({ assetId, exportProfile }) => {
      const job = jobService.createFakeExport({
        assetId,
        exportProfile,
        correlationId: randomUUID(),
      });

      return toolResult({
        jobId: job.id,
        status: job.status,
        correlationId: job.correlationId,
        simulated: true,
      });
    },
  );

  server.registerTool(
    "blender.get_job_status",
    {
      title: "Get Blender job status",
      description: "Returns an in-memory B0 job by identifier.",
      inputSchema: { jobId: jobIdSchema },
    },
    ({ jobId }) => {
      const job = jobService.getById(jobId);
      if (!job) {
        logger.warn("job.not_found", { jobId });
        return {
          content: [{ type: "text", text: JSON.stringify({ code: "JOB_NOT_FOUND", jobId }) }],
          isError: true,
        };
      }

      return toolResult({ job });
    },
  );

  return server;
}
