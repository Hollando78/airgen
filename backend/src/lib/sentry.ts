import type { FastifyRequest } from "fastify";
import { logger } from "./logger.js";

type SeverityLevel = "fatal" | "error" | "warning" | "info" | "debug";

interface MinimalTransaction {
  finish(): void;
}

interface MinimalScope {
  setExtra(key: string, value: unknown): void;
  setContext(key: string, context: Record<string, unknown>): void;
}

interface SentryIntegration {
  name: string;
  setupOnce(...args: unknown[]): void;
}

type SentryModule = typeof import("@sentry/node") & {
  startTransaction?: (options: { name: string; op: string }) => MinimalTransaction;
  withScope?: (callback: (scope: MinimalScope) => void) => void;
  setUser?: (user: Record<string, unknown> | null) => void;
  addBreadcrumb?: (breadcrumb: {
    message: string;
    category: string;
    level: SeverityLevel;
    data?: Record<string, unknown>;
    timestamp: number;
  }) => void;
  addIntegration?: (integration: SentryIntegration) => void;
  close: (timeout?: number) => PromiseLike<boolean>;
  captureException: (error: unknown) => void;
  captureMessage: (message: string, level?: SeverityLevel) => void;
  init: (options: Record<string, unknown>) => void;
};

type AnyFastifyRequest = FastifyRequest<any, any, any, any, any>;

let Sentry: SentryModule | null = null;
let isSentryAvailable = false;
let isSentryInitialized = false;

export async function initSentry(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn || dsn.trim() === "") {
    logger.info("SENTRY_DSN not configured, error tracking disabled");
    isSentryAvailable = false;
    return;
  }

  try {
    const sentryModule = await import("@sentry/node");

    const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development";
    const tracesSampleRate = Math.max(0, Math.min(1, Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1")));
    const release = process.env.SENTRY_RELEASE || process.env.npm_package_version || "0.1.0";

    sentryModule.init({
      dsn,
      environment,
      release: `airgen-backend@${release}`,
      tracesSampleRate
    });

    try {
      const profiling = await import("@sentry/profiling-node");
      const integrationFactory = (profiling as { nodeProfilingIntegration?: () => SentryIntegration }).nodeProfilingIntegration;
      if (integrationFactory && typeof sentryModule.addIntegration === "function") {
        sentryModule.addIntegration(integrationFactory());
        logger.info("Sentry profiling enabled");
      }
    } catch (profilingError) {
      logger.debug({ profilingError }, "Sentry profiling not available");
    }

    isSentryAvailable = true;
    isSentryInitialized = true;
    Sentry = sentryModule as SentryModule;
    logger.info({ environment, release: `airgen-backend@${release}`, tracesSampleRate }, "Sentry initialized successfully");
  } catch (error) {
    logger.info({ error }, "@sentry/node not installed, error tracking disabled. Install with: npm install @sentry/node");
    isSentryAvailable = false;
    isSentryInitialized = false;
    Sentry = null;
  }
}

export function isSentryEnabled(): boolean {
  return isSentryAvailable && isSentryInitialized;
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!isSentryEnabled() || !Sentry) {
    return;
  }

  if (context && typeof Sentry.withScope === "function") {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
      Sentry!.captureException(error);
    });
    return;
  }

  Sentry.captureException(error);
}

export function captureMessage(message: string, level: SeverityLevel = "info", context?: Record<string, unknown>): void {
  if (!isSentryEnabled() || !Sentry) {
    return;
  }

  if (context && typeof Sentry.withScope === "function") {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
      Sentry!.captureMessage(message, level);
    });
    return;
  }

  Sentry.captureMessage(message, level);
}

export function setUser(user: { id: string; email?: string; username?: string; roles?: string[] }): void {
  if (!isSentryEnabled() || !Sentry || typeof Sentry.setUser !== "function") {
    return;
  }

  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.username,
    roles: user.roles?.join(",")
  });
}

export function clearUser(): void {
  if (!isSentryEnabled() || !Sentry || typeof Sentry.setUser !== "function") {
    return;
  }

  Sentry.setUser(null);
}

export function setRequestContext(request: AnyFastifyRequest): void {
  if (!isSentryEnabled() || !Sentry || typeof Sentry.withScope !== "function") {
    return;
  }

  Sentry.withScope((scope) => {
    scope.setContext("request", {
      method: request.method,
      url: request.url,
      headers: {
        "user-agent": request.headers["user-agent"],
        "content-type": request.headers["content-type"]
      },
      query: request.query,
      ip: request.ip
    });

    if (request.currentUser) {
      setUser({
        id: request.currentUser.sub,
        email: request.currentUser.email,
        username: request.currentUser.email,
        roles: request.currentUser.roles
      });
    }
  });
}

export function startTransaction(name: string, op: string): MinimalTransaction | null {
  if (!isSentryEnabled() || !Sentry || typeof Sentry.startTransaction !== "function") {
    return null;
  }

  return Sentry.startTransaction({ name, op }) ?? null;
}

export function finishTransaction(transaction: MinimalTransaction | null): void {
  transaction?.finish();
}

export function addBreadcrumb(message: string, category = "default", level: SeverityLevel = "info", data?: Record<string, unknown>): void {
  if (!isSentryEnabled() || !Sentry || typeof Sentry.addBreadcrumb !== "function") {
    return;
  }

  Sentry.addBreadcrumb({
    message,
    category,
    level,
    data,
    timestamp: Date.now() / 1000
  });
}

export async function flush(timeout = 2000): Promise<boolean> {
  if (!isSentryEnabled() || !Sentry) {
    return true;
  }

  try {
    return await Sentry.close(timeout);
  } catch (error) {
    logger.warn({ error }, "Error flushing Sentry events");
    return false;
  }
}

export function sentryErrorHandler(error: Error, request: AnyFastifyRequest): void {
  if (!isSentryEnabled()) {
    return;
  }

  setRequestContext(request);
  captureException(error, {
    route: request.url,
    method: request.method,
    params: request.params as Record<string, unknown>,
    query: request.query as Record<string, unknown>
  });
}

export function getSentryStatus(): { enabled: boolean; initialized: boolean; dsn?: string } {
  return {
    enabled: isSentryAvailable,
    initialized: isSentryInitialized,
    dsn: isSentryInitialized ? "configured" : undefined
  };
}
