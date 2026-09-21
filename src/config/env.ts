import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  MCP_SERVER_NAME: z.string().trim().min(1).default("terravox-blender-mcp"),
  MCP_SERVER_VERSION: z.string().trim().min(1).default("0.1.0"),
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | undefined;

export function getEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  if (source === process.env && cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`);
  }

  if (source === process.env) {
    cachedEnv = parsed.data;
  }

  return parsed.data;
}
