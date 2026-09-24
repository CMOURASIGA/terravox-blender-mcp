import { describe, expect, it } from "vitest";
import { getEnv } from "../src/config/env.js";

describe("environment validation", () => {
  it("validates server-only Supabase configuration and applies safe defaults", () => {
    expect(
      getEnv({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key-not-a-secret",
      }),
    ).toEqual({
      NODE_ENV: "development",
      LOG_LEVEL: "info",
      MCP_SERVER_NAME: "terravox-blender-mcp",
      MCP_SERVER_VERSION: "0.1.0",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key-not-a-secret",
    });
  });

  it("requires the Supabase server credential", () => {
    expect(() => getEnv({ SUPABASE_URL: "https://example.supabase.co" })).toThrow(
      "Invalid environment",
    );
  });

  it("rejects an invalid log level", () => {
    expect(() => getEnv({ LOG_LEVEL: "verbose" })).toThrow("Invalid environment");
  });
});
