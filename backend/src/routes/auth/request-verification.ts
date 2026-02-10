import type { FastifyInstance } from "fastify";
import { createAuthRateLimitConfig } from "./shared.js";
import { createToken } from "../../lib/tokens.js";
import { sendVerificationEmail } from "../../lib/email.js";
import { userRepository } from "../../repositories/UserRepository.js";

export function registerRequestVerificationRoute(app: FastifyInstance) {
  const rateLimit = createAuthRateLimitConfig();

  app.post("/auth/request-verification", {
    preHandler: [app.authenticate],
    config: {
      rateLimit
    },
    schema: {
      tags: ["authentication"],
      summary: "Request email verification",
      description: "Send verification email to current user",
      security: [{ bearerAuth: [] }]
    }
  }, async (req, reply) => {
    if (!req.currentUser) {
      return reply.code(401).send({ error: "User not authenticated" });
    }

    const user = await userRepository.findById(req.currentUser.sub);
    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    if (user.emailVerified) {
      return reply.code(400).send({ error: "Email already verified" });
    }

    const token = await createToken(user.id, user.email, "email_verification");
    await sendVerificationEmail(user.email, user.name ?? undefined, token);

    return { message: "Verification email sent" };
  });
}
