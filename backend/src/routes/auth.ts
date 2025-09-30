import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ensureLegacyPasswordUpgrade,
  listDevUsers,
  verifyDevUserPassword
} from "../services/dev-users.js";

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

      // Verify password (supports both legacy and scrypt-based hashes)
      const authenticated = verifyDevUserPassword(user, password);
      if (!authenticated) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      // Upgrade legacy SHA256 hashes on successful auth
      await ensureLegacyPasswordUpgrade(user, password);

      // Generate JWT token
      const token = await reply.jwtSign(
        {
          sub: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles,
          tenantSlugs: user.tenantSlugs
        },
        { expiresIn: '24h' }
      );

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
}
