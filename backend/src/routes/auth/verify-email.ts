import type { FastifyInstance } from "fastify";
import { authSchemas, validateInput } from "../../lib/validation.js";
import { verifyAndConsumeToken } from "../../lib/tokens.js";
import { sendEmailVerifiedConfirmation } from "../../lib/email.js";
import { createAuthRateLimitConfig } from "./shared.js";
import { userRepository } from "../../repositories/UserRepository.js";

export function registerVerifyEmailRoute(app: FastifyInstance) {
  const rateLimit = createAuthRateLimitConfig();

  app.post("/auth/verify-email", {
    config: {
      rateLimit
    },
    schema: {
      tags: ["authentication"],
      summary: "Verify email address",
      description: "Verify email with token from verification email"
    }
  }, async (req, reply) => {
    const { token } = validateInput(authSchemas.verifyEmail, req.body);
    const tokenRecord = verifyAndConsumeToken(token, "email_verification");

    if (!tokenRecord) {
      return reply.code(400).send({ error: "Invalid or expired verification token" });
    }

    const user = await userRepository.markEmailVerified(tokenRecord.userId);

    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    app.log.info({
      event: "auth.email.verified",
      userId: user.id,
      email: user.email,
      ip: req.ip
    }, "Email verified successfully");

    sendEmailVerifiedConfirmation(user.email, user.name ?? undefined)
      .catch(emailError => {
        app.log.error({ err: emailError }, "Failed to send email verification confirmation");
      });

    return { message: "Email verified successfully" };
  });
}
