import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import jwt from "@fastify/jwt";
import { config } from "../config.js";

export type AuthenticatedUser = {
  sub: string;
  email?: string;
  name?: string;
  roles: string[];
  tenantSlugs?: string[];
};

type JwtPayload = {
  sub?: string;
  email?: string;
  name?: string;
  roles?: string[];
  tenantSlugs?: string[];
};

declare module "fastify" {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    optionalAuthenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }

  interface FastifyRequest {
    currentUser: AuthenticatedUser | null;
  }
}

function normalizeUser(payload: JwtPayload): AuthenticatedUser {
  if (!payload.sub) {
    throw new Error("JWT payload missing 'sub' claim");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    roles: Array.isArray(payload.roles) && payload.roles.length ? payload.roles : ["user"],
    tenantSlugs: Array.isArray(payload.tenantSlugs) ? payload.tenantSlugs : undefined
  };
}

export async function registerAuth(app: FastifyInstance<any, any, any, any, any>): Promise<void> {
  await app.register(jwt, { secret: config.jwtSecret });

  app.decorateRequest("currentUser", null);

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    request.currentUser = null;
    const payload = await request.jwtVerify<JwtPayload>();
    request.currentUser = normalizeUser(payload);
  });

  app.decorate("optionalAuthenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    request.currentUser = null;
    try {
      const payload = await request.jwtVerify<JwtPayload>();
      request.currentUser = normalizeUser(payload);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code && code === "FST_JWT_NO_AUTHORIZATION_IN_HEADER") {
        request.currentUser = null;
        return;
      }
      throw error;
    }
  });
}
