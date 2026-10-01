import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate";
import * as AiController from "./ai.controller";

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/ai/config:
 *   get:
 *     tags: [AI]
 *     summary: Get AI feature configuration
 *     description: Tells the frontend whether the AI layer is switched on, so it can hide all AI UI when it is off.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: AI configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     enabled: { type: boolean, example: false }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get("/config", AiController.getConfig);

/**
 * @openapi
 * /api/ai/escalations:
 *   get:
 *     tags: [AI]
 *     summary: Open issues at high risk of escalation
 *     description: >
 *       Open issues whose most recent sentiment reading is high escalation risk, within the
 *       viewer's normal tenancy (engineers see only their products). A separate signal for
 *       account managers: priority is shown alongside but never changed by sentiment.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: High-risk issues, most recently assessed first
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get("/escalations", requireRole("engineer", "admin"), AiController.getEscalations);

/**
 * @openapi
 * /api/ai/client-health:
 *   get:
 *     tags: [AI]
 *     summary: Sentiment trend per client company (admin)
 *     description: >
 *       Weekly average frustration, share of negative messages and high-risk readings per
 *       company, plus the last 30 days compared with the previous 30. Aggregates stored
 *       readings only; makes no LLM calls.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: days
 *         in: query
 *         schema: { type: integer, minimum: 14, maximum: 365, default: 90 }
 *     responses:
 *       200:
 *         description: One entry per company, including companies with no readings yet
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get("/client-health", requireRole("admin"), AiController.getClientHealth);

export default router;
