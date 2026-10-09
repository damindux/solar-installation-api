import type { MiddlewareHandler } from "hono";
import { notAcceptable, unsupportedMediaType } from "../lib/errors.ts";

function acceptsJson(header: string): boolean {
  let bestSpecificity = -1;
  let bestQuality = 0;
  for (const part of header.split(",")) {
    const [mediaType, ...parameters] = part.trim().toLowerCase().split(";");
    const qualityText = parameters.find((item) => item.trim().startsWith("q="));
    const quality = qualityText ? Number(qualityText.trim().slice(2)) : 1;
    const specificity = mediaType === "application/json"
      ? 2
      : mediaType === "application/*" || mediaType === "*/*"
      ? 1
      : -1;
    if (specificity > bestSpecificity) {
      bestSpecificity = specificity;
      bestQuality = quality;
    } else if (specificity === bestSpecificity) {
      bestQuality = Math.max(bestQuality, quality);
    }
  }
  return bestSpecificity >= 0 && bestQuality > 0;
}

export const negotiate: MiddlewareHandler = async (context, next) => {
  const path = context.req.path;
  if (path === "/api/v1" || path.startsWith("/api/v1/")) {
    const accept = context.req.header("Accept");
    if (accept && !acceptsJson(accept)) throw notAcceptable();

    if (context.req.method === "POST" || context.req.method === "PUT") {
      const contentType = context.req.header("Content-Type")?.split(";")[0]
        .trim().toLowerCase();
      if (contentType !== "application/json") throw unsupportedMediaType();
    }
  }

  await next();
};
