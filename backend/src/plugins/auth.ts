import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { config } from "../config.js";
import { createAuthPlugin } from "./auth/create-auth-plugin.js";
import type { AuthenticatedUser, RegisterAuthOptions } from "./auth/types.js";

export type { AuthenticatedUser, JwtPayload, CreateAuthPluginOptions } from "./auth/types.js";
export type { RegisterAuthOptions } from "./auth/types.js";
export { MissingSubClaimError, normalizeUser } from "./auth/normalize-user.js";
export { verifyAndAttachUser } from "./auth/verify-user.js";
export { createAuthPlugin };

declare module "fastify" {
  interface FastifyInstance {
    authenticate: preHandlerHookHandler;
    optionalAuthenticate: preHandlerHookHandler;
  }

  interface FastifyRequest {
    currentUser: AuthenticatedUser | null;
  }
}

export async function registerAuth(
  app: FastifyInstance,
  options: RegisterAuthOptions = {}
): Promise<void> {
  const plugin = createAuthPlugin({
    jwtSecret: options.jwtSecret ?? config.jwtSecret,
    logger: options.logger ?? app.log
  });

  await plugin(app);
}
