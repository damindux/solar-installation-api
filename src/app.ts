import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import type { AppConfig } from "./config.ts";
import { validation } from "./lib/errors.ts";
import { installErrorHandlers } from "./middleware/error-handler.ts";
import { negotiate } from "./middleware/negotiate.ts";
import { requestLog } from "./middleware/request-log.ts";
import type { Scope } from "./lib/jurisdiction.ts";
import { registerHierarchyRoutes } from "./routes/hierarchy.ts";
import { registerInstallationReadRoutes } from "./routes/installation-reads.ts";
import { registerReadingReadRoutes } from "./routes/generation-readings.ts";
import { requireDevice, requireUser } from "./middleware/auth.ts";
import { registerAuthRoutes } from "./routes/auth.ts";
import { registerInstallationWriteRoutes } from "./routes/installation-writes.ts";
import { registerGenerationWriteRoute } from "./routes/generation-write.ts";
import { conditionalGet } from "./middleware/conditional-get.ts";
import { swaggerUI } from "@hono/swagger-ui";
import { registerGenerationSummaryRoute } from "./routes/generation-summary.ts";

export type AppEnv = {
  Variables: {
    scope: Scope;
    principal: { kind: "user"; userId: number; scope: Scope } | {
      kind: "device";
      siteId: number;
    };
  };
};

export interface AppDependencies {
  db: Db;
  config: AppConfig;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createApp(
  { db, config }: AppDependencies,
): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>({
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
  app.use("/api/v1", conditionalGet);
  app.use("/api/v1/*", conditionalGet);
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
  app.use("/api/v1", requireUser(config));
  app.use("/api/v1/*", requireUser(config));
  app.use(
    "/api/v1/solar-installations/:site-id/generation-readings",
    requireDevice(db, config),
  );

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

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1",
      tags: ["API"],
      responses: {
        200: {
          description: "API information",
          content: {
            "application/json": {
              schema: z.object({
                name: z.string(),
                version: z.string(),
                docs: z.string(),
              }),
            },
          },
        },
      },
    }),
    (context) =>
      context.json({
        name: "Solar Generation API",
        version: "1.0.0",
        docs: "/docs",
      }),
  );

  registerHierarchyRoutes(app, db);
  registerInstallationReadRoutes(app, db);
  registerReadingReadRoutes(app, db);
  registerAuthRoutes(app, db, config);
  registerInstallationWriteRoutes(app, db);
  registerGenerationWriteRoute(app, db);
  registerGenerationSummaryRoute(app, db);

  const openApiDocument = {
    openapi: "3.1.0" as const,
    info: {
      title: "Solar Generation API",
      version: "1.0.0",
      description: `
        API for the Sri Lanka Sustainable Energy Authority solar generation model.

        ## Errors

        All errors use an integer code, a message, a description, a moreInfo link,
        and an error array. Device ingestion uses a device bearer token; other
        protected operations use a user JWT.
        `,
    },
  };
  app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
  });
  app.doc31("/openapi.json", openApiDocument);
  app.doc31("/api/v1/openapi.json", openApiDocument);
  app.get("/docs", swaggerUI({ url: "/openapi.json" }));

  installErrorHandlers(app);
  return app;
}
