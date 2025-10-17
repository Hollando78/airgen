import type { FastifyInstance } from "fastify";
import { registerLoginRoute } from "./auth/login.js";
import { registerRegistrationRoute } from "./auth/register.js";
import { registerCurrentUserRoute } from "./auth/me.js";
import { registerRefreshRoute } from "./auth/refresh.js";
import { registerLogoutRoute } from "./auth/logout.js";
import { registerLogoutAllRoute } from "./auth/logout-all.js";
import { registerMfaVerifyRoute } from "./auth/mfa-verify.js";
import { registerRequestVerificationRoute } from "./auth/request-verification.js";
import { registerVerifyEmailRoute } from "./auth/verify-email.js";
import { registerAcceptInvitationRoute } from "./auth/accept-invitation.js";
import { registerRequestPasswordResetRoute } from "./auth/request-password-reset.js";
import { registerResetPasswordRoute } from "./auth/reset-password.js";

export default async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  registerLoginRoute(app);
  registerRegistrationRoute(app);
  registerCurrentUserRoute(app);
  registerRefreshRoute(app);
  registerLogoutRoute(app);
  registerLogoutAllRoute(app);
  registerMfaVerifyRoute(app);
  registerRequestVerificationRoute(app);
  registerVerifyEmailRoute(app);
  registerAcceptInvitationRoute(app);
  registerRequestPasswordResetRoute(app);
  registerResetPasswordRoute(app);
}
