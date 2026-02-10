import type { FastifyInstance } from "fastify";
import { authSchemas, validateInput } from "../../lib/validation.js";
import { createToken } from "../../lib/tokens.js";
import { sendPasswordResetEmail } from "../../lib/email.js";
import { createAuthRateLimitConfig } from "./shared.js";
import { userRepository } from "../../repositories/UserRepository.js";

export function registerRequestPasswordResetRoute(app: FastifyInstance) {
  const rateLimit = createAuthRateLimitConfig();

  app.post("/auth/request-password-reset", {
    config: {
      rateLimit
    },
    schema: {
      tags: ["authentication"],
      summary: "Request password reset",
      description: "Send password reset email"
    }
  }, async (req) => {
    const { email } = validateInput(authSchemas.requestPasswordReset, req.body);
    const user = await userRepository.findByEmail(email);

    if (user) {
      const token = await createToken(user.id, user.email, "password_reset", 30);
      await sendPasswordResetEmail(user.email, user.name ?? undefined, token);
    }

    return { message: "If an account exists with this email, a password reset link has been sent" };
  });
}
