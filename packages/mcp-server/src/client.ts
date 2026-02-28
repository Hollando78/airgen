/**
 * AIRGen HTTP API client with JWT authentication.
 *
 * Handles login, token caching, and automatic refresh.
 */

export interface ClientConfig {
  apiUrl: string;
  email: string;
  password: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  /** Unix timestamp (ms) when the access token expires */
  tokenExpiresAt: number;
}

export class AirgenClient {
  private auth: AuthState = {
    accessToken: null,
    refreshToken: null,
    tokenExpiresAt: 0,
  };
  private loginPromise: Promise<void> | null = null;

  constructor(private config: ClientConfig) {}

  // ── HTTP methods ──────────────────────────────────────────────

  async get<T = unknown>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
    const qs = buildQueryString(query);
    return this.request<T>("GET", `${path}${qs}`);
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  async delete<T = unknown>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  /** Fetch binary content from an API path (e.g. document file download). */
  async fetchBinary(path: string): Promise<{ data: Buffer; contentType: string }> {
    await this.ensureAuth();
    const res = await this.fetch("GET", path);
    if (!res.ok) {
      const text = await res.text();
      const msg = text || `Request failed with status ${res.status}`;
      throw new AirgenApiError(res.status, msg, path);
    }
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const buffer = Buffer.from(await res.arrayBuffer());
    return { data: buffer, contentType };
  }

  /** Fetch a static file from the server root (not the /api prefix). */
  async fetchStaticFile(relativePath: string): Promise<{ data: Buffer; contentType: string }> {
    const baseUrl = this.config.apiUrl.replace(/\/api\/?$/, "");
    const url = `${baseUrl}${relativePath}`;
    const res = await globalThis.fetch(url);
    if (!res.ok) {
      throw new AirgenApiError(res.status, `Failed to fetch ${relativePath}`, relativePath);
    }
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const buffer = Buffer.from(await res.arrayBuffer());
    return { data: buffer, contentType };
  }

  // ── Internal ──────────────────────────────────────────────────

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    await this.ensureAuth();

    const res = await this.fetch(method, path, body);

    // If 401, try refreshing once then retry
    if (res.status === 401 && this.auth.refreshToken) {
      await this.refresh();
      const retry = await this.fetch(method, path, body);
      return this.handleResponse<T>(retry, path);
    }

    return this.handleResponse<T>(res, path);
  }

  private async fetch(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {};
    if (this.auth.accessToken) {
      headers["Authorization"] = `Bearer ${this.auth.accessToken}`;
    }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (this.auth.refreshToken) {
      headers["Cookie"] = `airgen_refresh=${this.auth.refreshToken}`;
    }

    const url = `${this.config.apiUrl}${path}`;
    try {
      return await globalThis.fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      const e = err as Error;
      const cause = e.cause ? ` cause=${(e.cause as Error).message ?? e.cause}` : "";
      console.error(`[fetch error] ${method} ${url}: ${e.message}${cause}`);
      throw new Error(`API request failed: ${method} ${path} — ${e.message}`, { cause: err });
    }
  }

  private async handleResponse<T>(res: Response, path: string): Promise<T> {
    if (res.status === 204) {
      return undefined as T;
    }

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }

    if (!res.ok) {
      const msg =
        typeof parsed === "object" && parsed !== null && "error" in parsed
          ? (parsed as { error: string }).error
          : typeof parsed === "string"
            ? parsed
            : `Request failed with status ${res.status}`;
      throw new AirgenApiError(res.status, msg, path);
    }

    return parsed as T;
  }

  // ── Auth ──────────────────────────────────────────────────────

  private async ensureAuth(): Promise<void> {
    // Already have a valid token (with 2min buffer)
    if (this.auth.accessToken && Date.now() < this.auth.tokenExpiresAt - 120_000) {
      return;
    }

    // Token exists but is expiring — try refresh
    if (this.auth.refreshToken) {
      await this.refresh();
      return;
    }

    // No token at all — login
    // Deduplicate concurrent login attempts
    if (!this.loginPromise) {
      this.loginPromise = this.login().finally(() => {
        this.loginPromise = null;
      });
    }
    await this.loginPromise;
  }

  private async login(): Promise<void> {
    const res = await globalThis.fetch(`${this.config.apiUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: this.config.email,
        password: this.config.password,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      let msg = `Login failed (${res.status})`;
      try {
        const json = JSON.parse(text);
        msg = json.error ?? msg;
      } catch { /* keep default */ }
      throw new AirgenApiError(res.status, msg, "/auth/login");
    }

    const data = await res.json() as
      | { token: string; user: unknown }
      | { status: "MFA_REQUIRED"; tempToken: string; message: string };

    if ("status" in data && data.status === "MFA_REQUIRED") {
      throw new Error(
        "AIRGen account has MFA enabled. MFA is not supported in headless MCP mode. " +
        "Please disable MFA for the MCP service account, or use a dedicated account without MFA."
      );
    }

    if (!("token" in data)) {
      throw new Error("Unexpected login response from AIRGen API");
    }

    this.auth.accessToken = data.token;
    this.auth.tokenExpiresAt = decodeTokenExpiry(data.token);
    this.auth.refreshToken = extractRefreshToken(res);
  }

  private async refresh(): Promise<void> {
    const headers: Record<string, string> = {};
    if (this.auth.refreshToken) {
      headers["Cookie"] = `airgen_refresh=${this.auth.refreshToken}`;
    }

    const res = await globalThis.fetch(`${this.config.apiUrl}/auth/refresh`, {
      method: "POST",
      headers,
    });

    if (!res.ok) {
      // Refresh failed — clear state and re-login
      this.auth = { accessToken: null, refreshToken: null, tokenExpiresAt: 0 };
      await this.login();
      return;
    }

    const data = await res.json() as { token: string };
    this.auth.accessToken = data.token;
    this.auth.tokenExpiresAt = decodeTokenExpiry(data.token);

    const newRefresh = extractRefreshToken(res);
    if (newRefresh) {
      this.auth.refreshToken = newRefresh;
    }
  }
}

// ── Error class ───────────────────────────────────────────────

export class AirgenApiError extends Error {
  constructor(
    public statusCode: number,
    public apiMessage: string,
    public endpoint: string,
  ) {
    super(`AIRGen API error (${statusCode}) on ${endpoint}: ${apiMessage}`);
    this.name = "AirgenApiError";
  }
}

// ── Helpers ───────────────────────────────────────────────────

function decodeTokenExpiry(jwt: string): number {
  try {
    const payload = jwt.split(".")[1];
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    return (decoded.exp ?? 0) * 1000; // Convert seconds to ms
  } catch {
    // If we can't decode, assume 10 minutes from now
    return Date.now() + 10 * 60 * 1000;
  }
}

function extractRefreshToken(res: Response): string | null {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return null;

  // Parse airgen_refresh cookie value
  const match = setCookie.match(/airgen_refresh=([^;]+)/);
  return match ? match[1] : null;
}

function buildQueryString(params?: Record<string, string | number | undefined>): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string | number] => entry[1] !== undefined,
  );
  if (entries.length === 0) return "";
  const qs = new URLSearchParams(entries.map(([k, v]) => [k, String(v)]));
  return `?${qs.toString()}`;
}
