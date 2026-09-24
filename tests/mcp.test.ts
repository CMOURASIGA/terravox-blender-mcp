import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it } from "vitest";
import { resetEnvCacheForTests } from "../src/config/env.js";
import { createMcpServer, MCP_TOOL_NAMES } from "../src/server/createMcpServer.js";
import { JobService } from "../src/services/jobService.js";
import { FakeJobRepository } from "./support/fakeJobRepository.js";

describe("MCP registry", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key-not-a-secret";
    resetEnvCacheForTests();
  });

  it("lists and executes the three B1 tools", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createMcpServer(new JobService(new FakeJobRepository()));
    const client = new Client({ name: "b1-test-client", version: "0.1.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual([...MCP_TOOL_NAMES].sort());

    const exported = await client.callTool({
      name: "blender.export_glb",
      arguments: { assetId: "chr-explorer-v001", exportProfile: "terravox-default" },
    });
    const exportData = exported.structuredContent as { jobId: string };
    expect(exportData.jobId).toBeTypeOf("string");

    const status = await client.callTool({
      name: "blender.get_job_status",
      arguments: { jobId: exportData.jobId },
    });
    expect(status.structuredContent).toMatchObject({
      job: { id: exportData.jobId, status: "queued", operation: "export_glb" },
    });
    expect(JSON.stringify([exported, status])).not.toContain(process.env.SUPABASE_SERVICE_ROLE_KEY);

    await client.close();
    await server.close();
  });
});
