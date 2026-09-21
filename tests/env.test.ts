import { describe, expect, it } from "vitest";
import { getEnv } from "../src/config/env.js";

describe("environment validation", () => {
  it("applies safe defaults", () => {
    expect(getEnv({})).toEqual({
      NODE_ENV: "development",
      LOG_LEVEL: "info",
      MCP_SERVER_NAME: "terravox-blender-mcp",
      MCP_SERVER_VERSION: "0.1.0",
    });
  });

  it("rejects an invalid log level", () => {
    expect(() => getEnv({ LOG_LEVEL: "verbose" })).toThrow("Invalid environment");
  });
});
