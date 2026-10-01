import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate";
import * as AiController from "./ai.controller";

// Mounted at /api/issues/:id/ai. mergeParams exposes :id to these handlers.
const router = Router({ mergeParams: true });

// AI data is internal: engineers and admins only, never clients
router.use(authenticate, requireRole("engineer", "admin"));

/**
 * @openapi
 * /api/issues/{id}/ai/suggestion:
 *   get:
 *     tags: [AI]
 *     summary: Latest AI triage suggestion for an issue
 *     description: >
 *       Returns the newest suggestion that hasn't been superseded, and the status of the
 *       latest analysis job (none, queued, running, done or failed). Engineers and admins
 *       only, with the same tenancy rules as the issue itself.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IssueId'
 *     responses:
 *       200:
 *         description: Suggestion and analysis status (suggestion is null until analysis completes)
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get("/suggestion", AiController.getSuggestion);

/**
 * @openapi
 * /api/issues/{id}/ai/suggestion/{suggestionId}/review:
 *   post:
 *     tags: [AI]
 *     summary: Accept, edit or reject an AI triage suggestion
 *     description: >
 *       `apply` sets the issue's impact, urgency, category and team, using the suggested
 *       value for any field left out. Priority is recomputed from impact and urgency as usual.
 *       The suggestion is recorded as `accepted` if every applied value matches the
 *       suggestion, otherwise `edited`. `reject` changes nothing on the issue.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IssueId'
 *       - name: suggestionId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required: [action]
 *                 properties:
 *                   action: { type: string, enum: [apply] }
 *                   impact: { type: string, enum: [low, medium, high] }
 *                   urgency: { type: string, enum: [low, medium, high] }
 *                   category: { type: string }
 *                   team: { type: string }
 *               - type: object
 *                 required: [action]
 *                 properties:
 *                   action: { type: string, enum: [reject] }
 *     responses:
 *       200:
 *         description: Reviewed suggestion, and the updated issue when applied
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: The suggestion has already been reviewed
 */
router.post("/suggestion/:suggestionId/review", AiController.reviewSuggestion);

/**
 * @openapi
 * /api/issues/{id}/ai/analyze:
 *   post:
 *     tags: [AI]
 *     summary: Queue a new AI analysis (e.g. after one failed)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IssueId'
 *     responses:
 *       202:
 *         description: Analysis queued
 *       409:
 *         description: An analysis is already queued or running
 *       422:
 *         description: The issue wasn't raised by a client
 */
router.post("/analyze", AiController.retryAnalysis);

/**
 * @openapi
 * /api/issues/{id}/ai/sentiment:
 *   get:
 *     tags: [AI]
 *     summary: Client sentiment across an issue's thread
 *     description: >
 *       One entry for the issue itself and one per client comment, oldest first. An internal
 *       signal for account managers: it never affects priority and is never shown to clients.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IssueId'
 *     responses:
 *       200:
 *         description: Sentiment timeline
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get("/sentiment", AiController.getSentimentTimeline);

export default router;
