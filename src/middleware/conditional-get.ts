import type { MiddlewareHandler } from "hono";
import { etagOf } from "../lib/hash.ts";

function weakTag(tag: string): string {
  return tag.trim().replace(/^W\//, "");
}

export const conditionalGet: MiddlewareHandler = async (context, next) => {
  await next();
  if (context.req.method !== "GET" || context.res.status !== 200) return;

  const body = await context.res.clone().text();
  const etag = await etagOf(body);
  const headers = new Headers(context.res.headers);
  headers.set("ETag", etag);

  const ifNoneMatch = context.req.header("If-None-Match");
  const lastModified = headers.get("Last-Modified");
  let notModified = false;
  if (ifNoneMatch !== undefined) {
    notModified = ifNoneMatch.split(",").some((tag) =>
      tag.trim() === "*" || weakTag(tag) === etag
    );
  } else {
    const ifModifiedSince = context.req.header("If-Modified-Since");
    if (ifModifiedSince && lastModified) {
      const modifiedAt = Date.parse(lastModified);
      const requestedAt = Date.parse(ifModifiedSince);
      notModified = !Number.isNaN(modifiedAt) &&
        !Number.isNaN(requestedAt) && modifiedAt <= requestedAt;
    }
  }

  if (notModified) {
    headers.delete("Content-Length");
    headers.delete("Content-Type");
    context.res = new Response(null, { status: 304, headers });
  } else {
    context.res = new Response(body, { status: 200, headers });
  }
};
