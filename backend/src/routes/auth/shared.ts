import { config } from "../../config.js";

export function createAuthRateLimitConfig() {
  return {
    max: config.rateLimit.auth.max,
    timeWindow: config.rateLimit.auth.timeWindow,
    errorResponseBuilder: () => ({
      error: "Too many authentication attempts. Please try again later.",
      statusCode: 429,
      retryAfter: Math.ceil(config.rateLimit.auth.timeWindow / 1000)
    })
  };
}

/**
 * Generate a unique tenant slug from email address.
 * Format: username portion (sanitized) plus timestamp suffix for uniqueness.
 */
export function generateTenantSlug(email: string): string {
  const username = email.split("@")[0] || "user";
  const sanitized = username
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .substring(0, 20);
  const timestamp = Date.now().toString(36);
  return `${sanitized}-${timestamp}`;
}
