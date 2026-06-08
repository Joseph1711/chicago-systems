import winston from "winston";

const isDev = (process.env.NODE_ENV ?? "development") !== "production";

export const logger = winston.createLogger({
  level: isDev ? "debug" : "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    isDev
      ? winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
            return `${timestamp} [${level}] ${message}${metaStr}`;
          })
        )
      : winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

export function logInfo(meta: object, message: string): void {
  logger.info(message, meta);
}

export function logDebug(meta: object, message: string): void {
  logger.debug(message, meta);
}

export function logWarn(meta: object, message: string): void {
  logger.warn(message, meta);
}

export function logError(meta: object, message: string): void {
  logger.error(message, meta);
}
