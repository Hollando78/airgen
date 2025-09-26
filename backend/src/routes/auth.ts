import { FastifyInstance } from "fastify";
import { z } from "zod";
import { createHash } from "node:crypto";
import { getDevUser, listDevUsers } from "../services/dev-users.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

export default async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/login", async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body);
    
    try {
      // Find user by email
      const users = await listDevUsers();
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
      
      if (!user || !user.password) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }
      
      // Verify password
      const hashedPassword = hashPassword(password);
      if (user.password !== hashedPassword) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }
      
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
      const { password: _, ...userWithoutPassword } = user;
      return {
        token,
        user: userWithoutPassword
      };
    } catch (error) {
      app.log.error(error, "Login error");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });
  
  app.get("/auth/me", { preHandler: [app.authenticate] }, async (req) => {
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