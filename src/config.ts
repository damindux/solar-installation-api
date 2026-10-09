export interface AppConfig {
  port: number;
  databaseUrl: string;
  runtimeDatabaseUrl: string;
  jwtSecret: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function loadConfig(
  env: Record<string, string> = Deno.env.toObject(),
): AppConfig {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new ConfigError("DATABASE_URL is required");

  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret) throw new ConfigError("JWT_SECRET is required");

  const rawPort = env.PORT ?? "8000";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(
      `PORT must be an integer from 1 to 65535; received ${rawPort}`,
    );
  }

  return {
    port,
    databaseUrl,
    runtimeDatabaseUrl: env.DATABASE_URL_POOLED ?? databaseUrl,
    jwtSecret,
  };
}
