import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createMcpServer, MCP_TOOL_NAMES } from "../src/server/createMcpServer.js";
import { jobService } from "../src/services/inMemoryJobService.js";

describe("MCP registry", () => {
  afterEach(() => jobService.clear());

  it("lists and executes the B0 tools", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createMcpServer();
    const client = new Client({ name: "b0-test-client", version: "0.1.0" });

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
      job: { id: exportData.jobId, status: "completed", operation: "export_glb" },
    });

    await client.close();
    await server.close();
  });
});
