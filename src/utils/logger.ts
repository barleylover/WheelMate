import { loadConfig } from "../config.js";

const config = loadConfig();

const write = (level: string, message: string, meta?: unknown): void => {
  const suffix = meta === undefined ? "" : ` ${JSON.stringify(meta)}`;
  console.error(`[${level}] ${message}${suffix}`);
};

export const logger = {
  debug(message: string, meta?: unknown): void {
    if (config.debug) {
      write("debug", message, meta);
    }
  },
  info(message: string, meta?: unknown): void {
    write("info", message, meta);
  },
  warn(message: string, meta?: unknown): void {
    write("warn", message, meta);
  },
  error(message: string, meta?: unknown): void {
    write("error", message, meta);
  }
};
