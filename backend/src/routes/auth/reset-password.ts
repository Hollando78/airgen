import type { FastifyInstance } from "fastify";
import { authSchemas, validateInput } from "../../lib/validation.js";
import { verifyAndConsumeToken, revokeUserTokens } from "../../lib/tokens.js";
import { hashPassword } from "../../lib/password.js";
import { revokeAllUserTokens } from "../../lib/refresh-tokens.js";
import { sendPasswordChangedEmail } from "../../lib/email.js";
import { createAuthRateLimitConfig } from "./shared.js";
import { userRepository } from "../../repositories/UserRepository.js";

export function registerResetPasswordRoute(app: FastifyInstance) {
  const rateLimit = createAuthRateLimitConfig();

  app.post("/auth/reset-password", {
    config: {
      rateLimit
    },
    schema: {
      tags: ["authentication"],
      summary: "Reset password",
      description: "Reset password with token from reset email"
    }
  }, async (req, reply) => {
    const { token, password } = validateInput(authSchemas.resetPassword, req.body);

    const tokenRecord = verifyAndConsumeToken(token, "password_reset");

    if (!tokenRecord) {
      return reply.code(400).send({ error: "Invalid or expired reset token" });
    }

    const user = await userRepository.findById(tokenRecord.userId);

    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    const hashedPassword = await hashPassword(password);
    await userRepository.update(user.id, { passwordHash: hashedPassword });

    await revokeAllUserTokens(user.id);
    revokeUserTokens(user.id, "password_reset");

    app.log.info({
      event: "auth.password.reset",
      userId: user.id,
      email: user.email,
      ip: req.ip
    }, "Password reset successfully");

    await sendPasswordChangedEmail(user.email, user.name ?? undefined);

    return { message: "Password reset successfully. Please log in with your new password." };
  });
}
