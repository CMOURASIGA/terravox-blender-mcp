import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getEnv } from "../src/config/env.js";
import { jobService } from "../src/services/inMemoryJobService.js";

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  const env = getEnv();
  const body = {
    status: "ok",
    server: env.MCP_SERVER_NAME,
    version: env.MCP_SERVER_VERSION,
    jobStore: { type: "in-memory", status: "ok", jobs: jobService.size },
    worker: { status: "not-configured" },
  };

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}
