import { z } from "zod";

export const PageQuery = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type Page = z.infer<typeof PageQuery>;

export function envelope<T>(url: URL, data: T[], count: number, page: Page) {
  const link = (offset: number): string => {
    const nextUrl = new URL(url);
    nextUrl.searchParams.set("offset", String(offset));
    nextUrl.searchParams.set("limit", String(page.limit));
    return nextUrl.pathname + nextUrl.search;
  };

  return {
    count,
    offset: page.offset,
    limit: page.limit,
    next: page.offset + page.limit < count
      ? link(page.offset + page.limit)
      : null,
    previous: page.offset > 0
      ? link(Math.max(0, page.offset - page.limit))
      : null,
    data,
  };
}

export function pageCollectionSchema<T extends z.ZodType>(item: T) {
  return z.object({
    count: z.number().int(),
    offset: z.number().int(),
    limit: z.number().int(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    data: z.array(item),
  });
}
