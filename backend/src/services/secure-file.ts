import { promises as fs } from "node:fs";
import { join, resolve, relative, normalize, sep } from "node:path";
import { config } from "../config.js";

/**
 * Validates that a file path is safe and within the allowed workspace
 * Prevents path traversal attacks
 */
export function validateFilePath(
  baseDirectory: string,
  requestedPath: string
): { isValid: boolean; safePath?: string; error?: string } {
  try {
    // Normalize both paths to handle different path separators and resolve .. references
    const normalizedBase = normalize(resolve(baseDirectory));
    const normalizedRequested = normalize(resolve(baseDirectory, requestedPath));

    // Check if the requested path is within the base directory
    const relativePath = relative(normalizedBase, normalizedRequested);

    // If the relative path starts with .. or is absolute, it's trying to escape
    if (relativePath.startsWith('..' + sep) || relativePath.startsWith('..' + '/') || resolve(normalizedRequested) !== normalizedRequested) {
      return {
        isValid: false,
        error: 'Path traversal detected: requested path is outside allowed directory'
      };
    }

    // Additional check: ensure the resolved path starts with the base directory
    if (!normalizedRequested.startsWith(normalizedBase + sep) && normalizedRequested !== normalizedBase) {
      return {
        isValid: false,
        error: 'Invalid path: must be within workspace'
      };
    }

    return {
      isValid: true,
      safePath: normalizedRequested
    };
  } catch (error) {
    return {
      isValid: false,
      error: `Path validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Safely reads a file with path validation
 */
export async function readFileSafely(
  baseDirectory: string,
  requestedPath: string
): Promise<string> {
  const validation = validateFilePath(baseDirectory, requestedPath);

  if (!validation.isValid || !validation.safePath) {
    throw new Error(validation.error || 'Invalid file path');
  }

  try {
    const content = await fs.readFile(validation.safePath, 'utf-8');
    return content;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`File not found: ${requestedPath}`);
    }
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      throw new Error(`Permission denied: ${requestedPath}`);
    }
    throw new Error(`Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Gets the safe workspace path for a tenant and project
 */
export function getWorkspacePath(tenant: string, project: string): string {
  // Only allow alphanumeric characters, hyphens, and underscores
  const sanitizedTenant = tenant.replace(/[^a-zA-Z0-9_-]/g, '_');
  const sanitizedProject = project.replace(/[^a-zA-Z0-9_-]/g, '_');

  return resolve(config.workspaceRoot, sanitizedTenant, sanitizedProject);
}

/**
 * Checks if a path exists and is accessible
 */
export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets file stats safely
 */
export async function getFileStats(
  baseDirectory: string,
  requestedPath: string
): Promise<{ size: number; mtime: Date; isFile: boolean; isDirectory: boolean }> {
  const validation = validateFilePath(baseDirectory, requestedPath);

  if (!validation.isValid || !validation.safePath) {
    throw new Error(validation.error || 'Invalid file path');
  }

  try {
    const stats = await fs.stat(validation.safePath);
    return {
      size: stats.size,
      mtime: stats.mtime,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory()
    };
  } catch (error) {
    throw new Error(`Failed to get file stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
