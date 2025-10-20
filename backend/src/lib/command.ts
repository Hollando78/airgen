import { spawn } from "child_process";

export interface RunCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  error?: Error;
}

export function runCommand(command: string, args: string[], options: RunCommandOptions = {}): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timeoutId: NodeJS.Timeout | undefined;
    let spawnError: Error | undefined;

    if (typeof options.timeout === "number" && options.timeout > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, options.timeout);
    }

    if (child.stdout) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on("error", (error) => {
      spawnError = error;
    });

    child.on("close", (code, signal) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      resolve({
        stdout,
        stderr,
        code,
        signal,
        timedOut,
        error: spawnError
      });
    });
  });
}

export function isCommandSuccessful(result: CommandResult): boolean {
  return !result.timedOut && !result.error && result.code === 0;
}

export function formatCommandOutput(result: CommandResult): string {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}
