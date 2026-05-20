import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate";
import * as UserController from "./users.controller";

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get own profile
 *     description: Returns the authenticated user's profile including their company (if client).
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Own profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserDetailResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get("/me", UserController.getMe);

/**
 * @openapi
 * /api/users/me/password:
 *   patch:
 *     tags: [Users]
 *     summary: Change own password
 *     description: >
 *       Verifies the current password before applying the new one.
 *       Returns 204 on success. Does not invalidate existing sessions.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChangePasswordRequest'
 *     responses:
 *       204:
 *         description: Password changed
 *       401:
 *         description: Current password is wrong
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         $ref: '#/components/responses/ValidationFailed'
 */
router.patch("/me/password", UserController.changePassword);

/**
 * @openapi
 * /api/users:
 *   get:
 *     tags: [Users]
 *     summary: List all users (admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserListResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get("/", requireRole("admin"), UserController.list);

/**
 * @openapi
 * /api/users:
 *   post:
 *     tags: [Users]
 *     summary: Create a user (admin only)
 *     description: >
 *       Admin-initiated user creation. `client_user` requires `companyId`.
 *       `engineer` and `admin` optionally take `office`.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUserRequest'
 *           example:
 *             email: "engineer@newnop.com"
 *             password: "Secret@2026"
 *             fullName: "Ji-ho Kim"
 *             role: "engineer"
 *             office: "KR"
 *     responses:
 *       201:
 *         description: User created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserResponse'
 *       409:
 *         description: Email already registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         $ref: '#/components/responses/ValidationFailed'
 */
router.post("/", requireRole("admin"), UserController.create);

/**
 * @openapi
 * /api/users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get a user with product access (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/UserId'
 *     responses:
 *       200:
 *         description: User detail with product access list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserDetailResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get("/:id", requireRole("admin"), UserController.getOne);

/**
 * @openapi
 * /api/users/{id}:
 *   patch:
 *     tags: [Users]
 *     summary: Update a user (admin only)
 *     description: >
 *       Partial update. Use `isActive: false` to deactivate a user
 *       (they will not be able to log in but the account is preserved).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/UserId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateUserRequest'
 *     responses:
 *       200:
 *         description: User updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserResponse'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: Email already registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         $ref: '#/components/responses/ValidationFailed'
 */
router.patch("/:id", requireRole("admin"), UserController.update);

/**
 * @openapi
 * /api/users/{id}/products:
 *   post:
 *     tags: [Users]
 *     summary: Grant product access to an engineer (admin only)
 *     description: >
 *       Idempotent — granting access a second time returns the same 201 without error.
 *       The target user must have the `engineer` role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/UserId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GrantProductAccessRequest'
 *           example:
 *             productId: "2"
 *     responses:
 *       201:
 *         description: Access granted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductAccessResponse'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       422:
 *         description: Target user is not an engineer
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/:id/products", requireRole("admin"), UserController.grantProductAccess);

/**
 * @openapi
 * /api/users/{id}/products/{productId}:
 *   delete:
 *     tags: [Users]
 *     summary: Revoke product access from an engineer (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/UserId'
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID to revoke
 *     responses:
 *       204:
 *         description: Access revoked
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete("/:id/products/:productId", requireRole("admin"), UserController.revokeProductAccess);

export default router;
