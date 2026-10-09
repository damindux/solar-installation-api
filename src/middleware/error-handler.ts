import type { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import type { Env } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  AppError,
  forbidden,
  internalError,
  invalidRequest,
  methodNotAllowed,
  notAcceptable,
  notFound,
  toErrorBody,
  unsupportedMediaType,
} from "../lib/errors.ts";

function appErrorFromHttpException(error: HTTPException): AppError | undefined {
  switch (error.status) {
    case 400:
      return invalidRequest();
    case 403:
      return forbidden(40301, "Access denied");
    case 404:
      return notFound();
    case 405:
      return methodNotAllowed();
    case 406:
      return notAcceptable();
    case 415:
      return unsupportedMediaType();
    default:
      return undefined;
  }
}

export function installErrorHandlers<E extends Env>(app: OpenAPIHono<E>): void {
  app.onError((error, context) => {
    const httpAppError = error instanceof HTTPException
      ? appErrorFromHttpException(error)
      : undefined;
    const appError = error instanceof AppError
      ? error
      : httpAppError
      ? httpAppError
      : internalError();
    if (!(error instanceof AppError) && !httpAppError) {
      console.error(error);
    }
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
