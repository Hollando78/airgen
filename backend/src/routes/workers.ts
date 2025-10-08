import type { FastifyPluginAsync } from "fastify";
import { qaScorer } from "../workers/qa-scorer.js";

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
};

export default workersRoutes;
