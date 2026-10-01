import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
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

export default router;
