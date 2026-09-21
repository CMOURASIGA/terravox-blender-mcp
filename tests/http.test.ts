import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterEach, describe, expect, it } from "vitest";
import handler from "../api/mcp.js";
import { jobService } from "../src/services/inMemoryJobService.js";

describe("Streamable HTTP endpoint", () => {
  afterEach(() => jobService.clear());

  it("initializes and lists B0 tools over HTTP", async () => {
    const httpServer = createServer((req, res) => {
      void (async () => {
        req.setEncoding("utf8");
        let rawBody = "";
        for await (const chunk of req) {
          if (typeof chunk === "string") {
            rawBody += chunk;
          }
        }

        const request = req as VercelRequest;
        request.body = rawBody ? (JSON.parse(rawBody) as unknown) : undefined;
        await handler(request, res as VercelResponse);
      })().catch((error: unknown) => {
        res.statusCode = 500;
        res.end(error instanceof Error ? error.message : "Unknown test server error");
      });
    });

    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const { port } = httpServer.address() as AddressInfo;
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${port}/api/mcp`),
    );
    const client = new Client({ name: "http-test-client", version: "0.1.0" });

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
        "blender.export_glb",
        "blender.get_job_status",
        "blender.health",
      ]);
    } finally {
      await client.close();
      await new Promise<void>((resolve, reject) =>
        httpServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
