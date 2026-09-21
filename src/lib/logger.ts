import { getEnv } from "../config/env.js";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogData = Record<string, unknown>;

const weights: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function write(level: LogLevel, event: string, data: LogData = {}): void {
  const configuredLevel = getEnv().LOG_LEVEL;
  if (weights[level] < weights[configuredLevel]) {
    return;
  }

  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...data,
  });

  if (level === "error") {
    console.error(entry);
    return;
  }

  if (level === "warn") {
    console.warn(entry);
    return;
  }

  console.log(entry);
}

export const logger = {
  debug: (event: string, data?: LogData) => write("debug", event, data),
  info: (event: string, data?: LogData) => write("info", event, data),
  warn: (event: string, data?: LogData) => write("warn", event, data),
  error: (event: string, data?: LogData) => write("error", event, data),
};
