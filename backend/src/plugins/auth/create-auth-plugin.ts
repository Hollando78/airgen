import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import jwt from "@fastify/jwt";
import type { CreateAuthPluginOptions } from "./types.js";
import { verifyAndAttachUser } from "./verify-user.js";

export function createAuthPlugin({
  jwtSecret,
  logger
}: CreateAuthPluginOptions): (app: FastifyInstance) => Promise<void> {
  return async function authPlugin(app: FastifyInstance): Promise<void> {
    await app.register(jwt, { secret: jwtSecret });

    app.decorateRequest("currentUser", null);

    const pluginLogger = logger ?? app.log;
    const onVerificationError = (error: unknown) => {
      pluginLogger.error({ err: error }, "JWT verification failed");
    };

    app.decorate("authenticate", async (request: FastifyRequest, _reply: FastifyReply) => {
      await verifyAndAttachUser(request, { onError: onVerificationError });
    });

    app.decorate("optionalAuthenticate", async (request: FastifyRequest, _reply: FastifyReply) => {
      await verifyAndAttachUser(request, { onError: onVerificationError, optional: true });
    });
  };
}
