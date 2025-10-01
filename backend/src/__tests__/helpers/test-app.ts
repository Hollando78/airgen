import Fastify, { FastifyInstance } from "fastify";
import { registerAuth } from "../../plugins/auth.js";

/**
 * Creates a test Fastify instance with minimal configuration
 * Useful for testing routes in isolation
 */
export async function createTestApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false // Disable logging in tests
  });

  // Register auth plugin for JWT support
  await registerAuth(app);

  return app;
}

/**
 * Creates a JWT token for testing authenticated routes
 * @param app - Fastify instance with auth plugin registered
 * @param payload - JWT payload
 */
export async function createTestToken(
  app: FastifyInstance,
  payload: {
    sub: string;
    email?: string;
    name?: string;
    roles?: string[];
    tenantSlugs?: string[];
  }
): Promise<string> {
  return app.jwt.sign(payload, { expiresIn: "1h" });
}

/**
 * Helper to inject authenticated requests
 */
export async function authenticatedInject(
  app: FastifyInstance,
  options: {
    method: string;
    url: string;
    payload?: any;
    token: string;
  }
) {
  return app.inject({
    method: options.method,
    url: options.url,
    payload: options.payload,
    headers: {
      Authorization: `Bearer ${options.token}`
    }
  });
}
