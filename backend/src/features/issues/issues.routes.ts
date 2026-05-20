import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate";
import * as IssueController from "./issues.controller";

const router = Router();

// All issues routes require authentication
router.use(authenticate);

/**
 * @openapi
 * /api/issues/stats:
 *   get:
 *     tags: [Issues]
 *     summary: Dashboard statistics (admin only)
 *     description: >
 *       Returns aggregated counts by status, priority, and region, plus
 *       summary KPIs: open issues, critical count, SLA-at-risk, and
 *       issues resolved in the last 7 days.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/IssueStatsResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get("/stats", requireRole("admin"), IssueController.stats);

/**
 * @openapi
 * /api/issues/export:
 *   get:
 *     tags: [Issues]
 *     summary: Export issues as CSV or JSON (admin only)
 *     description: >
 *       Exports up to 1,000 issues. Use `format=csv` for a spreadsheet-ready
 *       file or `format=json` for a structured array. Optionally filter by
 *       `status` or `product_id`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, json]
 *           default: json
 *       - in: query
 *         name: status
 *         schema:
 *           $ref: '#/components/schemas/IssueStatus'
 *       - in: query
 *         name: product_id
 *         schema:
 *           type: string
 *           example: "1"
 *     responses:
 *       200:
 *         description: Issues exported
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/IssueExportRow'
 *                 count:
 *                   type: integer
 *           text/csv:
 *             schema:
 *               type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get("/export", requireRole("admin"), IssueController.exportData);

/**
 * @openapi
 * /api/issues:
 *   get:
 *     tags: [Issues]
 *     summary: List issues
 *     description: >
 *       Returns a paginated list of issues filtered by the caller's role:
 *       - **client_user** — issues for their company's products only
 *       - **engineer** — issues for products they are assigned to
 *       - **admin** — all issues
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Searches ticket number, title, and description
 *       - in: query
 *         name: status
 *         schema:
 *           $ref: '#/components/schemas/IssueStatus'
 *       - in: query
 *         name: priority
 *         schema:
 *           $ref: '#/components/schemas/PriorityLevel'
 *       - in: query
 *         name: type
 *         schema:
 *           $ref: '#/components/schemas/IssueType'
 *       - in: query
 *         name: product_id
 *         schema:
 *           type: string
 *           example: "1"
 *       - in: query
 *         name: assigned_to
 *         schema:
 *           type: string
 *           example: "5"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [createdAt_desc, createdAt_asc, updatedAt_desc]
 *           default: createdAt_desc
 *     responses:
 *       200:
 *         description: Paginated issue list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/IssueListResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get("/", IssueController.list);

/**
 * @openapi
 * /api/issues:
 *   post:
 *     tags: [Issues]
 *     summary: Create a new issue
 *     description: >
 *       Creates an issue for a product the caller has access to.
 *       Priority is automatically computed from the ITIL impact × urgency matrix:
 *       low/low → low, high/high → critical.
 *       The ticket number (`{CODE}-{NNNN}`) is assigned atomically.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateIssueRequest'
 *           example:
 *             productId: "1"
 *             title: "Login page shows 500 on bad password"
 *             description: "Reproducible with any invalid password. Stack trace attached."
 *             type: bug
 *             impact: high
 *             urgency: high
 *     responses:
 *       201:
 *         description: Issue created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/IssueDetailResponse'
 *       404:
 *         description: Product not found or not accessible
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         $ref: '#/components/responses/ValidationFailed'
 */
router.post("/", IssueController.create);

/**
 * @openapi
 * /api/issues/{id}:
 *   get:
 *     tags: [Issues]
 *     summary: Get issue detail
 *     description: >
 *       Returns full issue details including comments (internal comments are
 *       hidden from `client_user`), activity log (last 50 entries), and
 *       attachments. Always returns 404 when the issue exists but the caller
 *       cannot access it — never 403.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IssueId'
 *     responses:
 *       200:
 *         description: Issue detail
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/IssueDetailResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get("/:id", IssueController.getOne);

/**
 * @openapi
 * /api/issues/{id}:
 *   patch:
 *     tags: [Issues]
 *     summary: Update an issue
 *     description: >
 *       Partial update. Status changes are validated against the transition
 *       state machine. Priority is automatically recomputed when `impact` or
 *       `urgency` changes. Every field change is appended to the activity log.
 *       `client_user` may only update issues they created.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IssueId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateIssueRequest'
 *     responses:
 *       200:
 *         description: Issue updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/IssueDetailResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       422:
 *         $ref: '#/components/responses/ValidationFailed'
 */
router.patch("/:id", IssueController.update);

/**
 * @openapi
 * /api/issues/{id}:
 *   delete:
 *     tags: [Issues]
 *     summary: Cancel an issue (admin only)
 *     description: >
 *       Soft-deletes an issue by setting its status to `cancelled` and recording
 *       `closedAt`. Issues that are already `closed` or `cancelled` cannot be
 *       cancelled again. This action is irreversible.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IssueId'
 *     responses:
 *       204:
 *         description: Issue cancelled
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: Issue is already in a terminal state
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete("/:id", requireRole("admin"), IssueController.remove);

/**
 * @openapi
 * /api/issues/{id}/assign:
 *   post:
 *     tags: [Issues]
 *     summary: Assign an engineer to an issue
 *     description: >
 *       Assigns or reassigns an engineer to an issue. The assignee must be a
 *       user with the `engineer` role and must be active.
 *       Available to `engineer` and `admin` roles.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IssueId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AssignIssueRequest'
 *           example:
 *             assigneeId: "7"
 *     responses:
 *       200:
 *         description: Issue assigned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/IssueDetailResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       422:
 *         description: Assignee is not an active engineer
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/:id/assign", requireRole("admin", "engineer"), IssueController.assign);

/**
 * @openapi
 * /api/issues/{id}/resolve:
 *   post:
 *     tags: [Issues]
 *     summary: Mark an issue as resolved
 *     description: >
 *       Transitions the issue to `resolved` status and records `resolvedAt`.
 *       The issue must be in `in_progress` or `on_hold` state.
 *       Available to `engineer` and `admin` roles.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IssueId'
 *     responses:
 *       200:
 *         description: Issue resolved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/IssueDetailResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       422:
 *         description: Invalid status transition
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/:id/resolve", requireRole("admin", "engineer"), IssueController.resolve);

/**
 * @openapi
 * /api/issues/{id}/comments:
 *   post:
 *     tags: [Issues]
 *     summary: Add a comment to an issue
 *     description: >
 *       Adds a comment to an issue. Set `isInternal: true` to post an
 *       engineer/admin-only note — `client_user` cannot post internal comments
 *       and will receive 403 if they attempt to do so.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IssueId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCommentRequest'
 *           example:
 *             body: "Reproduced on staging. Deploying hotfix now."
 *             isInternal: false
 *     responses:
 *       201:
 *         description: Comment created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommentResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       422:
 *         $ref: '#/components/responses/ValidationFailed'
 */
router.post("/:id/comments", IssueController.addComment);

/**
 * @openapi
 * /api/issues/{id}/attachments/presign:
 *   post:
 *     tags: [Issues]
 *     summary: Request a presigned S3 upload URL
 *     description: >
 *       Returns a presigned PUT URL valid for 5 minutes. The client must PUT
 *       the file directly to S3 with matching `Content-Type` and `Content-Length`
 *       headers. After a successful upload, call `POST /attachments` to confirm
 *       and persist the record. Returns 503 when S3 is not configured.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IssueId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PresignUploadRequest'
 *           example:
 *             filename: "screenshot.png"
 *             mimeType: "image/png"
 *             sizeBytes: 204800
 *     responses:
 *       200:
 *         description: Presigned URL generated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PresignUploadResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       422:
 *         $ref: '#/components/responses/ValidationFailed'
 *       503:
 *         description: S3 not configured on this server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/:id/attachments/presign", IssueController.presignUpload);

/**
 * @openapi
 * /api/issues/{id}/attachments:
 *   post:
 *     tags: [Issues]
 *     summary: Confirm an uploaded attachment
 *     description: >
 *       After the client has successfully PUT the file to S3, call this endpoint
 *       to persist the attachment record. The `s3Key` must match the value
 *       returned by `POST /attachments/presign`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IssueId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ConfirmAttachmentRequest'
 *     responses:
 *       201:
 *         description: Attachment record created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AttachmentResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       422:
 *         $ref: '#/components/responses/ValidationFailed'
 */
router.post("/:id/attachments", IssueController.confirmAttachment);

/**
 * @openapi
 * /api/issues/{id}/attachments/{attId}/download:
 *   get:
 *     tags: [Issues]
 *     summary: Get a presigned download URL for an attachment
 *     description: >
 *       Returns a presigned GET URL valid for 15 minutes. The client should
 *       redirect the user to this URL or use it in an `<a href>`. Returns 503
 *       when S3 is not configured.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/IssueId'
 *       - in: path
 *         name: attId
 *         required: true
 *         schema:
 *           type: string
 *         description: Attachment ID
 *     responses:
 *       200:
 *         description: Download URL generated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DownloadUrlResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       503:
 *         description: S3 not configured on this server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/:id/attachments/:attId/download", IssueController.getDownloadUrl);

export default router;
