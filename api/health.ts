import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getEnv } from "../src/config/env.js";
import { getJobService } from "../src/services/serviceContainer.js";

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  const env = getEnv();
  try {
    const body = {
      status: "ok",
      server: env.MCP_SERVER_NAME,
      version: env.MCP_SERVER_VERSION,
      jobStore: await getJobService().health(),
      worker: { status: "not-configured" },
    };
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
  } catch {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ status: "error", server: env.MCP_SERVER_NAME }));
  }
}
