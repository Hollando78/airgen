import type { FastifyRequest } from "fastify";
import { normalizeUser } from "./normalize-user.js";
import type { AuthenticatedUser, JwtPayload } from "./types.js";

const NO_AUTH_HEADER_CODE = "FST_JWT_NO_AUTHORIZATION_IN_HEADER";

export interface VerifyAndAttachUserOptions {
  optional?: boolean;
  onError?: (error: unknown) => void;
}

export async function verifyAndAttachUser(
  request: FastifyRequest,
  { optional = false, onError }: VerifyAndAttachUserOptions
): Promise<AuthenticatedUser | null> {
  request.currentUser = null;

  try {
    const payload = await request.jwtVerify<JwtPayload>();
    const user = normalizeUser(payload);
    request.currentUser = user;
    return user;
  } catch (error) {
    if (optional && isMissingAuthHeaderError(error)) {
      return null;
    }

    onError?.(error);
    throw error;
  }
}

function isMissingAuthHeaderError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === NO_AUTH_HEADER_CODE
  );
}
