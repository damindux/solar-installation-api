import type { OpenAPIHono } from "@hono/zod-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  AppError,
  internalError,
  notFound,
  toErrorBody,
} from "../lib/errors.ts";

export function installErrorHandlers(app: OpenAPIHono): void {
  app.onError((error, context) => {
    const appError = error instanceof AppError ? error : internalError();
    if (!(error instanceof AppError)) console.error(error);
    const headers: Record<string, string> = appError.status === 401
      ? { "WWW-Authenticate": 'Bearer realm="slsea-api"' }
      : {};
    return context.json(
      toErrorBody(appError),
      appError.status as ContentfulStatusCode,
      headers,
    );
  });

  app.notFound((context) => {
    const error = notFound();
    return context.json(toErrorBody(error), 404);
  });
}
