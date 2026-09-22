import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getEnv } from "../config/env.js";
import { assetIdSchema, exportProfileSchema, jobIdSchema } from "../domain/job.js";
import { logger } from "../lib/logger.js";
import { JobService } from "../services/jobService.js";
import { getJobService } from "../services/serviceContainer.js";

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

export function createMcpServer(jobService: JobService = getJobService()): McpServer {
  const env = getEnv();
  const server = new McpServer({
    name: env.MCP_SERVER_NAME,
    version: env.MCP_SERVER_VERSION,
  });

  server.registerTool(
    "blender.health",
    {
      title: "Blender MCP health",
      description: "Reports the MCP, persistent job store and worker configuration status.",
      inputSchema: {},
      outputSchema: {
        status: z.literal("ok"),
        server: z.string(),
        version: z.string(),
        jobStore: z.object({ type: z.literal("supabase-postgres"), status: z.literal("ok") }),
        worker: z.object({ status: z.literal("not-configured") }),
      },
    },
    async () =>
      toolResult({
        status: "ok",
        server: env.MCP_SERVER_NAME,
        version: env.MCP_SERVER_VERSION,
        jobStore: await jobService.health(),
        worker: { status: "not-configured" },
      }),
  );

  server.registerTool(
    "blender.export_glb",
    {
      title: "Queue simulated GLB export job",
      description: "Persists a queued B1 simulation job. No Blender process is executed.",
      inputSchema: {
        assetId: assetIdSchema.describe("Backend asset identifier, never a filesystem path."),
        exportProfile: exportProfileSchema.default("terravox-default"),
      },
      outputSchema: {
        jobId: jobIdSchema,
        status: z.literal("queued"),
        correlationId: jobIdSchema,
        simulated: z.literal(true),
      },
    },
    async ({ assetId, exportProfile }) => {
      const job = await jobService.createSimulatedExport({
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
      description: "Returns a persistent B1 job by identifier.",
      inputSchema: { jobId: jobIdSchema },
    },
    async ({ jobId }) => {
      const job = await jobService.getById(jobId);
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
