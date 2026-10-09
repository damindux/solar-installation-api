import { createRoute, z } from "@hono/zod-openapi";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import type { Db } from "../../db/client.ts";
import type { AppConfig } from "../config.ts";
import { unauthorized } from "../lib/errors.ts";
import type { AppEnv } from "../app.ts";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { getUserByUsername, getUserScope } from "../repos/users.ts";

const DUMMY_PASSWORD_HASH =
  "$2a$10$OEItSC9hokijYC1jbh0oQelx4WCHeYdLLjnVMeLZiPMYgMy88Fg.y";
const LoginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
const LoginResponse = z.object({
  token: z.string(),
  token_type: z.literal("Bearer"),
  expires_at: z.string(),
});

export function registerAuthRoutes(
  app: OpenAPIHono<AppEnv>,
  db: Db,
  config: AppConfig,
): void {
  const loginRoute = createRoute({
    method: "post",
    path: "/api/v1/auth/login",
    tags: ["Authentication"],
    request: {
      body: { content: { "application/json": { schema: LoginBody } } },
    },
    responses: {
      200: {
        description: "JWT credentials",
        content: { "application/json": { schema: LoginResponse } },
      },
    },
  });

  app.openapi(loginRoute, async (context) => {
    const { username, password } = context.req.valid("json");
    const user = await getUserByUsername(db, username);
    const matches = await bcrypt.compare(
      password,
      user?.password_hash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !matches) {
      throw unauthorized(40103, "Invalid username or password");
    }

    const scope = await getUserScope(db, user);
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + 24 * 60 * 60;
    const token = await new SignJWT({ ...scope })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(user.user_id))
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .sign(new TextEncoder().encode(config.jwtSecret));

    return context.json({
      token,
      token_type: "Bearer" as const,
      expires_at: new Date(expiresAt * 1000).toISOString(),
    }, 200);
  });
}
