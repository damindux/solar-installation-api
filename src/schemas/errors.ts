import { z } from "@hono/zod-openapi";

export const ErrorSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  description: z.string(),
  moreInfo: z.string(),
  error: z.array(z.object({
    field: z.string(),
    message: z.string(),
    code: z.number().int(),
  })),
});

export const errorResponses = {
  400: {
    description: "Validation error",
    content: { "application/json": { schema: ErrorSchema } },
  },
  401: {
    description: "Authentication required",
    content: { "application/json": { schema: ErrorSchema } },
  },
  403: {
    description: "Forbidden",
    content: { "application/json": { schema: ErrorSchema } },
  },
  404: {
    description: "Resource not found",
    content: { "application/json": { schema: ErrorSchema } },
  },
  406: {
    description: "Not acceptable",
    content: { "application/json": { schema: ErrorSchema } },
  },
  409: {
    description: "Conflict",
    content: { "application/json": { schema: ErrorSchema } },
  },
  412: {
    description: "Precondition failed",
    content: { "application/json": { schema: ErrorSchema } },
  },
  415: {
    description: "Unsupported media type",
    content: { "application/json": { schema: ErrorSchema } },
  },
  422: {
    description: "Referenced entity is invalid",
    content: { "application/json": { schema: ErrorSchema } },
  },
  500: {
    description: "Internal server error",
    content: { "application/json": { schema: ErrorSchema } },
  },
};
