import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { logger } from "../src/lib/logger.js";
import { createMcpServer } from "../src/server/createMcpServer.js";

export const config = {
  api: {
    bodyParser: true,
  },
};

function setCors(res: VercelResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }));
    return;
  }

  const startedAt = Date.now();
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    logger.info("mcp.request_completed", {
      method: req.method,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    logger.error("mcp.request_failed", {
      method: req.method,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "INTERNAL_SERVER_ERROR" }));
    }
  } finally {
    await transport.close();
    await server.close();
  }
}
