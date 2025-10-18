import type { FastifyPluginAsync } from "fastify";
import { qaScorer } from "../workers/qa-scorer.js";
import { embeddingWorker } from "../workers/embedding-worker.js";

const workersRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /workers/qa-scorer/start
   * Start the QA scoring worker for a project
   */
  fastify.post("/workers/qa-scorer/start", async (request, reply) => {
    const { tenant, project } = request.body as { tenant?: string; project?: string };

    if (!tenant || !project) {
      return reply.code(400).send({ error: "tenant and project are required" });
    }

    try {
      // Start the worker in the background (don't await)
      qaScorer.scoreAllRequirements(tenant, project).catch((error) => {
        fastify.log.error("QA scorer worker failed:", error);
      });

      return reply.send({
        message: "QA scorer started",
        status: qaScorer.getStatus()
      });
    } catch (error) {
      if ((error as Error).message === "QA scorer is already running") {
        return reply.code(409).send({ error: "QA scorer is already running" });
      }
      fastify.log.error(error);
      return reply.code(500).send({ error: "Failed to start QA scorer" });
    }
  });

  /**
   * GET /workers/qa-scorer/status
   * Get the current status of the QA scorer worker
   */
  fastify.get("/workers/qa-scorer/status", async (request, reply) => {
    return reply.send(qaScorer.getStatus());
  });

  /**
   * POST /workers/qa-scorer/stop
   * Stop the QA scoring worker
   */
  fastify.post("/workers/qa-scorer/stop", async (request, reply) => {
    qaScorer.stop();
    return reply.send({
      message: "QA scorer stop requested",
      status: qaScorer.getStatus()
    });
  });

  /**
   * POST /workers/embedding/start
   * Start the embedding worker for a project
   */
  fastify.post("/workers/embedding/start", async (request, reply) => {
    const { tenant, project, operation } = request.body as {
      tenant?: string;
      project?: string;
      operation?: 'backfill' | 'reembed-all'
    };

    if (!tenant || !project) {
      return reply.code(400).send({ error: "tenant and project are required" });
    }

    if (!operation || !['backfill', 'reembed-all'].includes(operation)) {
      return reply.code(400).send({
        error: "operation is required and must be 'backfill' or 'reembed-all'"
      });
    }

    try {
      // Start the worker in the background (don't await)
      const workerPromise = operation === 'backfill'
        ? embeddingWorker.backfillEmbeddings(tenant, project)
        : embeddingWorker.reembedAll(tenant, project);

      workerPromise.catch((error) => {
        fastify.log.error("Embedding worker failed:", error);
      });

      return reply.send({
        message: `Embedding worker started (${operation})`,
        status: embeddingWorker.getStatus()
      });
    } catch (error) {
      if ((error as Error).message === "Embedding worker is already running") {
        return reply.code(409).send({ error: "Embedding worker is already running" });
      }
      fastify.log.error(error);
      return reply.code(500).send({ error: "Failed to start embedding worker" });
    }
  });

  /**
   * GET /workers/embedding/status
   * Get the current status of the embedding worker
   */
  fastify.get("/workers/embedding/status", async (request, reply) => {
    return reply.send(embeddingWorker.getStatus());
  });

  /**
   * POST /workers/embedding/stop
   * Stop the embedding worker
   */
  fastify.post("/workers/embedding/stop", async (request, reply) => {
    embeddingWorker.stop();
    return reply.send({
      message: "Embedding worker stop requested",
      status: embeddingWorker.getStatus()
    });
  });
};

export default workersRoutes;
