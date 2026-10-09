import { getEnv } from "../config/env.js";

type LogLevel = "debug" | "info" | "warn" | "error";
export type LogData = Record<string, unknown>;

const weights: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug: (event: string, data?: LogData) => void;
  info: (event: string, data?: LogData) => void;
  warn: (event: string, data?: LogData) => void;
  error: (event: string, data?: LogData) => void;
  child: (context: LogData) => Logger;
}

function write(level: LogLevel, context: LogData, event: string, data: LogData = {}): void {
  const configuredLevel = getEnv().LOG_LEVEL;
  if (weights[level] < weights[configuredLevel]) {
    return;
  }

  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context,
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

export function createLogger(context: LogData = {}): Logger {
  return {
    debug: (event, data) => write("debug", context, event, data),
    info: (event, data) => write("info", context, event, data),
    warn: (event, data) => write("warn", context, event, data),
    error: (event, data) => write("error", context, event, data),
    child: (extra) => createLogger({ ...context, ...extra }),
  };
}

export const logger: Logger = createLogger();
