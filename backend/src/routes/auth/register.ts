import type { FastifyInstance } from "fastify";
import { authSchemas, validateInput } from "../../lib/validation.js";
import { UserRepository } from "../../repositories/UserRepository.js";
import { PermissionRepository } from "../../repositories/PermissionRepository.js";
import { createTenant } from "../../services/graph.js";
import {
  sendSuccessfulSignupNotification,
  sendVerificationEmail,
  sendWelcomeEmail,
  sendFailedSignupNotification
} from "../../lib/email.js";
import { createToken } from "../../lib/tokens.js";
import { createAuthRateLimitConfig, generateTenantSlug } from "./shared.js";
import { hashPassword } from "../../lib/password.js";
import { UserRole } from "../../types/roles.js";

export function registerRegistrationRoute(app: FastifyInstance) {
  const rateLimit = createAuthRateLimitConfig();
  const userRepo = new UserRepository();
  const permRepo = new PermissionRepository();

  app.post("/auth/register", {
    config: {
      rateLimit
    },
    schema: {
      tags: ["authentication"],
      summary: "Register new user",
      description: "Creates a new user account with email and password",
      body: {
        type: "object",
        required: ["email", "password", "name"],
        properties: {
          email: { type: "string", format: "email", description: "User email address" },
          password: { type: "string", minLength: 8, description: "User password (min 8 characters)" },
          name: { type: "string", minLength: 1, description: "User's full name" }
        }
      },
      response: {
        201: {
          type: "object",
          properties: {
            message: { type: "string" },
            user: {
              type: "object",
              properties: {
                id: { type: "string" },
                email: { type: "string" },
                name: { type: "string" }
              }
            }
          }
        },
        400: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        409: {
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
    let attemptedEmail: string | undefined;

    try {
      const { email, password, name } = validateInput(authSchemas.register, req.body);
      attemptedEmail = email;

      const tenantSlug = generateTenantSlug(email);

      const passwordHash = await hashPassword(password);
      const user = await userRepo.create({
        email,
        name,
        passwordHash,
        emailVerified: false
      });

      try {
        await createTenant({
          slug: tenantSlug,
          name: name ? `${name}'s Workspace` : `${email.split("@")[0]}'s Workspace`
        });

        await permRepo.grantPermission({
          userId: user.id,
          scopeType: "tenant",
          scopeId: tenantSlug,
          role: UserRole.TENANT_ADMIN,
          isOwner: true
        });

        app.log.info({
          event: "auth.register.tenant_created",
          userId: user.id,
          email: user.email,
          tenantSlug,
          ip: req.ip
        }, "Personal tenant created for new user");
      } catch (tenantError) {
        app.log.error({
          error: tenantError,
          userId: user.id,
          email: user.email,
          tenantSlug
        }, "Failed to create tenant for new user");
      }

      app.log.info({
        event: "auth.register.success",
        userId: user.id,
        email: user.email,
        tenantSlug,
        ip: req.ip
      }, "User registered successfully");

      const verificationToken = createToken(user.id, user.email, "email_verification");

      Promise.all([
        sendSuccessfulSignupNotification(user.email, user.name ?? undefined, tenantSlug, req.ip),
        sendVerificationEmail(user.email, user.name ?? undefined, verificationToken),
        sendWelcomeEmail(user.email, user.name ?? undefined)
      ]).catch(emailError => {
        app.log.error({ err: emailError }, "Failed to send onboarding email");
      });

      return reply.code(201).send({
        message: "Account created successfully. Please sign in.",
        user: {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined
        }
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EUSER_EXISTS") {
        app.log.warn({
          event: "auth.register.duplicate_email",
          email: attemptedEmail,
          ip: req.ip
        }, "Registration attempt with existing email");
        return reply.code(409).send({ error: "An account with this email already exists" });
      }

      if ((error as any).statusCode === 400 && (error as any).validation) {
        const validationErrors = (error as any).validation as Array<{ field: string; message: string }>;
        const emailFromBody = attemptedEmail || (req.body as any)?.email || "unknown";

        app.log.warn({
          event: "auth.register.validation_failed",
          email: emailFromBody,
          ip: req.ip,
          errors: validationErrors
        }, "Registration validation failed");

        sendFailedSignupNotification(emailFromBody, validationErrors, req.ip)
          .catch(emailError => {
            app.log.error({ err: emailError }, "Failed to send signup failure notification");
          });

        return reply.code(400).send({
          error: "Validation failed",
          details: validationErrors
        });
      }

      app.log.error(error, "Registration error");
      return reply.code(500).send({ error: "Internal server error" });
    }
  });
}
