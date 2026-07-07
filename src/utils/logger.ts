type LogFields = Record<string, string | number | boolean | null | undefined>;

function emit(level: "info" | "warn" | "error", message: string, fields: LogFields = {}): void {
  const safeFields = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  );
  const payload = JSON.stringify({ level, message, ...safeFields });
  if (level === "error") {
    console.error(payload);
    return;
  }
  console.error(payload);
}

export const logger = {
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields)
};
