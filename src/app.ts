import { OpenAPIHono } from "@hono/zod-openapi";
import { sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import type { AppConfig } from "./config.ts";
import { validation } from "./lib/errors.ts";
import { installErrorHandlers } from "./middleware/error-handler.ts";
import { negotiate } from "./middleware/negotiate.ts";
import { requestLog } from "./middleware/request-log.ts";

export interface AppDependencies {
  db: Db;
  config: AppConfig;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createApp({ db }: AppDependencies): OpenAPIHono {
  const app = new OpenAPIHono({
    defaultHook: (result) => {
      if (!result.success) {
        throw validation(result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })));
      }
    },
  });

  app.use("*", requestLog);
  app.use("/api/v1", negotiate);
  app.use("/api/v1/*", negotiate);
  app.use("/api/v1", async (context, next) => {
    context.header("Cache-Control", "private, no-cache");
    context.header("Vary", "Authorization, Accept");
    await next();
  });
  app.use("/api/v1/*", async (context, next) => {
    context.header("Cache-Control", "private, no-cache");
    context.header("Vary", "Authorization, Accept");
    await next();
  });

  app.get("/", (context) => context.html("<h1>Welcome to Deno!</h1>"));
  app.get("/health", async (context) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        db.execute(sql.raw("SELECT 1")),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error("Database probe timed out after 3 seconds")),
            3000,
          );
        }),
      ]);
      return context.json({ status: "ok", db: "ok" as const });
    } catch (error) {
      return context.json({
        status: "ok",
        db: "error" as const,
        db_message: errorMessage(error),
      });
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  });

  app.get("/api/v1", (context) =>
    context.json({
      name: "Solar Generation API",
      version: "1.0.0",
      docs: "/docs",
    }));

  installErrorHandlers(app);
  return app;
}
