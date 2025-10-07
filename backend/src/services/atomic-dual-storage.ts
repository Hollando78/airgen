import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import type { ManagedTransaction, Session } from "neo4j-driver";
import { logger } from "../lib/logger.js";

/**
 * Represents a pending file operation
 */
interface FileOperation {
  type: "write" | "delete";
  path: string;
  content?: string;
  backupPath?: string;
}

/**
 * Atomic wrapper that ensures Neo4j + Markdown file consistency
 *
 * Usage:
 * ```typescript
 * const transaction = new AtomicDualStorageTransaction(session);
 * try {
 *   await transaction.executeWrite(async (tx) => {
 *     // Neo4j operations
 *     await tx.run(...);
 *
 *     // File operations (queued, not executed yet)
 *     await transaction.queueFileWrite('/path/to/file.md', 'content');
 *
 *     return result;
 *   });
 *   // Both Neo4j and file operations committed automatically
 * } catch (error) {
 *   // Both Neo4j and file operations rolled back automatically
 *   throw error;
 * }
 * ```
 */
export class AtomicDualStorageTransaction {
  private session: Session;
  private fileOperations: FileOperation[] = [];
  private backupDir: string;
  private committed = false;

  constructor(session: Session, backupDir = "/tmp/airgen-backups") {
    this.session = session;
    this.backupDir = backupDir;
  }

  /**
   * Queue a file write operation (not executed until commit)
   */
  async queueFileWrite(filePath: string, content: string): Promise<void> {
    // Create backup path for this file
    const timestamp = Date.now();
    const backupPath = join(this.backupDir, `${timestamp}-${filePath.replace(/\//g, "_")}`);

    // Check if file exists and back it up
    try {
      await fs.access(filePath);
      const existingContent = await fs.readFile(filePath, "utf8");
      await fs.mkdir(dirname(backupPath), { recursive: true });
      await fs.writeFile(backupPath, existingContent, "utf8");
    } catch {
      // File doesn't exist, no backup needed
    }

    this.fileOperations.push({
      type: "write",
      path: filePath,
      content,
      backupPath
    });
  }

  /**
   * Queue a file delete operation (not executed until commit)
   */
  async queueFileDelete(filePath: string): Promise<void> {
    const timestamp = Date.now();
    const backupPath = join(this.backupDir, `${timestamp}-${filePath.replace(/\//g, "_")}`);

    // Backup file before deletion
    try {
      await fs.access(filePath);
      const existingContent = await fs.readFile(filePath, "utf8");
      await fs.mkdir(dirname(backupPath), { recursive: true });
      await fs.writeFile(backupPath, existingContent, "utf8");

      this.fileOperations.push({
        type: "delete",
        path: filePath,
        backupPath
      });
    } catch {
      // File doesn't exist, nothing to delete
      logger.warn({ filePath }, "Attempted to delete non-existent file");
    }
  }

  /**
   * Execute a Neo4j write transaction with file operations
   * Automatically commits or rolls back both Neo4j and file operations
   */
  async executeWrite<T>(
    work: (tx: ManagedTransaction) => Promise<T>
  ): Promise<T> {
    let neo4jResult: T;

    try {
      // Execute Neo4j transaction
      neo4jResult = await this.session.executeWrite(work);

      // If Neo4j succeeded, execute file operations
      await this.commitFileOperations();

      this.committed = true;
      return neo4jResult;
    } catch (error) {
      // Rollback file operations if Neo4j failed
      await this.rollbackFileOperations();
      throw error;
    }
  }

  /**
   * Execute a Neo4j read transaction (no file operations)
   */
  async executeRead<T>(
    work: (tx: ManagedTransaction) => Promise<T>
  ): Promise<T> {
    return this.session.executeRead(work);
  }

  /**
   * Commit all queued file operations
   */
  private async commitFileOperations(): Promise<void> {
    const errors: Error[] = [];

    for (const operation of this.fileOperations) {
      try {
        if (operation.type === "write" && operation.content !== undefined) {
          await fs.mkdir(dirname(operation.path), { recursive: true });
          await fs.writeFile(operation.path, operation.content, "utf8");
        } else if (operation.type === "delete") {
          await fs.unlink(operation.path);
        }
      } catch (error) {
        errors.push(error as Error);
        logger.error({ error, operation }, "Failed to commit file operation");
      }
    }

    if (errors.length > 0) {
      // File operations failed after Neo4j succeeded - critical inconsistency
      logger.error(
        { errorCount: errors.length, operations: this.fileOperations },
        "CRITICAL: File operations failed after Neo4j commit - data inconsistency detected"
      );

      // Attempt to rollback
      await this.rollbackFileOperations();

      throw new Error(
        `File operations failed after Neo4j commit. ${errors.length} operation(s) failed. System may be in inconsistent state.`
      );
    }

    // Success - clean up backups
    await this.cleanupBackups();
  }

  /**
   * Rollback all file operations using backups
   */
  private async rollbackFileOperations(): Promise<void> {
    for (const operation of this.fileOperations) {
      if (!operation.backupPath) {
        continue;
      }

      try {
        // Restore from backup
        const backupContent = await fs.readFile(operation.backupPath, "utf8");
        await fs.mkdir(dirname(operation.path), { recursive: true });
        await fs.writeFile(operation.path, backupContent, "utf8");
      } catch (error) {
        logger.error(
          { error, operation },
          "Failed to rollback file operation - manual intervention may be required"
        );
      }
    }

    // Clean up backups after rollback
    await this.cleanupBackups();
  }

  /**
   * Delete all backup files
   */
  private async cleanupBackups(): Promise<void> {
    for (const operation of this.fileOperations) {
      if (operation.backupPath) {
        try {
          await fs.unlink(operation.backupPath);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }

  /**
   * Close the underlying Neo4j session
   */
  async close(): Promise<void> {
    if (!this.committed && this.fileOperations.length > 0) {
      // Transaction not committed, rollback file operations
      await this.rollbackFileOperations();
    }
    await this.session.close();
  }
}

/**
 * Helper function to create and execute an atomic transaction
 */
export async function withAtomicDualStorage<T>(
  session: Session,
  work: (transaction: AtomicDualStorageTransaction) => Promise<T>
): Promise<T> {
  const transaction = new AtomicDualStorageTransaction(session);
  try {
    return await work(transaction);
  } finally {
    await transaction.close();
  }
}
