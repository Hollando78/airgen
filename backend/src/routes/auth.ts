import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ensureLegacyPasswordUpgrade,
  listDevUsers,
  verifyDevUserPassword,
  getDevUser
} from "../services/dev-users.js";
import {
  createRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens
} from "../lib/refresh-tokens.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export default async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/login", {
    schema: {
      tags: ["authentication"],
      summary: "Authenticate user",
      description: "Authenticates user with email and password, returns JWT token",
      body: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email", description: "User email address" },
          password: { type: "string", minLength: 1, description: "User password" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            token: { type: "string", description: "JWT authentication token" },
            user: {
              type: "object",
              properties: {
                id: { type: "string" },
                email: { type: "string" },
                name: { type: "string" },
                roles: { type: "array", items: { type: "string" } },
                tenantSlugs: { type: "array", items: { type: "string" } }
              }
            }
          }
        },
        401: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        500: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body);

    try {
      // Find user by email
      const users = await listDevUsers();
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

      if (
        !user ||
        (!user.password && (!user.passwordHash || !user.passwordSalt))
      ) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      // Verify password (supports Argon2id, legacy scrypt, and legacy SHA256)
      const authenticated = await verifyDevUserPassword(user, password);
      if (!authenticated) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      // Upgrade legacy hashes to Argon2id on successful auth
      await ensureLegacyPasswordUpgrade(user, password);

      // Generate short-lived JWT access token (15 minutes)
      const token = await reply.jwtSign(
        {
          sub: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles,
          tenantSlugs: user.tenantSlugs
        },
        { expiresIn: '15m' }
      );

      // Generate long-lived refresh token (7 days)
      const refreshToken = createRefreshToken(user.id);

      // Set refresh token as httpOnly cookie (secure in production)
      const isProduction = process.env.NODE_ENV === "production" || process.env.API_ENV === "production";
      reply.setCookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: isProduction, // HTTPS only in production
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 // 7 days in seconds
      });

      // Return token and user info (without password)
      const { password: _legacy, passwordHash: _hash, passwordSalt: _salt, ...userWithoutPassword } = user;
      return {
        token,
        user: userWithoutPassword
      };
    } catch (error) {
      app.log.error(error, "Login error");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });
  
  app.get("/auth/me", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["authentication"],
      summary: "Get current user",
      description: "Retrieves authenticated user information",
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: "object",
          properties: {
            user: {
              type: "object",
              properties: {
                id: { type: "string" },
                email: { type: "string" },
                name: { type: "string" },
                roles: { type: "array", items: { type: "string" } },
                tenantSlugs: { type: "array", items: { type: "string" } }
              }
            }
          }
        }
      }
    }
  }, async (req) => {
    if (!req.currentUser) {
      throw new Error("User not authenticated");
    }

    // Return current user info
    return {
      user: {
        id: req.currentUser.sub,
        email: req.currentUser.email,
        name: req.currentUser.name,
        roles: req.currentUser.roles,
        tenantSlugs: req.currentUser.tenantSlugs
      }
    };
  });

  app.post("/auth/refresh", {
    schema: {
      tags: ["authentication"],
      summary: "Refresh access token",
      description: "Exchange refresh token for new access token (uses httpOnly cookie)",
      response: {
        200: {
          type: "object",
          properties: {
            token: { type: "string", description: "New JWT access token" }
          }
        },
        401: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    // Get refresh token from httpOnly cookie
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return reply.status(401).send({ error: "No refresh token provided" });
    }

    // Verify refresh token (this also marks it as used)
    const userId = verifyRefreshToken(refreshToken);

    if (!userId) {
      // Token invalid, expired, or already used
      reply.clearCookie("refreshToken");
      return reply.status(401).send({ error: "Invalid or expired refresh token" });
    }

    // Get user from database
    const user = await getDevUser(userId);
    if (!user) {
      reply.clearCookie("refreshToken");
      return reply.status(401).send({ error: "User not found" });
    }

    // Generate new access token
    const token = await reply.jwtSign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
        tenantSlugs: user.tenantSlugs
      },
      { expiresIn: '15m' }
    );

    // Generate new refresh token (rotation)
    const newRefreshToken = createRefreshToken(user.id);

    // Set new refresh token as httpOnly cookie
    const isProduction = process.env.NODE_ENV === "production" || process.env.API_ENV === "production";
    reply.setCookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 // 7 days in seconds
    });

    return { token };
  });

  app.post("/auth/logout", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["authentication"],
      summary: "Logout user",
      description: "Revoke refresh token and clear session",
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: "object",
          properties: {
            message: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    // Revoke refresh token if present
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
      revokeRefreshToken(refreshToken);
    }

    // Clear refresh token cookie
    reply.clearCookie("refreshToken");

    return { message: "Logged out successfully" };
  });

  app.post("/auth/logout-all", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["authentication"],
      summary: "Logout from all devices",
      description: "Revoke all refresh tokens for the current user",
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: "object",
          properties: {
            message: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    if (!req.currentUser) {
      return reply.status(401).send({ error: "User not authenticated" });
    }

    // Revoke all refresh tokens for this user
    revokeAllUserTokens(req.currentUser.sub);

    // Clear refresh token cookie
    reply.clearCookie("refreshToken");

    return { message: "Logged out from all devices" };
  });
}
