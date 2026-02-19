/* eslint-disable no-console */

type LogContext = Record<string, unknown>;

export const logger = {
  info(message: string, context?: LogContext) {
    console.log(JSON.stringify({ level: "info", message, context, time: new Date().toISOString() }));
  },
  warn(message: string, context?: LogContext) {
    console.warn(JSON.stringify({ level: "warn", message, context, time: new Date().toISOString() }));
  },
  error(message: string, context?: LogContext) {
    console.error(JSON.stringify({ level: "error", message, context, time: new Date().toISOString() }));
  }
};
