import type { MiddlewareHandler } from "hono";

export const requestLog: MiddlewareHandler = async (context, next) => {
  const startedAt = performance.now();
  await next();
  const elapsed = Math.round(performance.now() - startedAt);
  console.log(
    `${context.req.method} ${context.req.path} ${context.res.status} ${elapsed}ms`,
  );
};
