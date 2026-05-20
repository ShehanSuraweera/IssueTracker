import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate";
import * as ProductController from "./products.controller";

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/products:
 *   get:
 *     tags: [Products]
 *     summary: List products
 *     description: >
 *       Role-filtered:
 *       - **admin** — all products
 *       - **engineer** — products they have been granted access to
 *       - **client_user** — products belonging to their company
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Product list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductListResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get("/", ProductController.list);

/**
 * @openapi
 * /api/products:
 *   post:
 *     tags: [Products]
 *     summary: Create a product (admin only)
 *     description: >
 *       The `code` must be unique, uppercase alphanumeric, and max 8 characters
 *       (e.g. `APTWEB`, `DVL`). It is used as the ticket number prefix.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateProductRequest'
 *           example:
 *             companyId: "1"
 *             name: "ApartmentLK Web Portal"
 *             code: "APTWEB"
 *             owningOffice: "LK"
 *             description: "Customer-facing property listing portal"
 *     responses:
 *       201:
 *         description: Product created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductResponse'
 *       404:
 *         description: Company not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Product code already in use
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         $ref: '#/components/responses/ValidationFailed'
 */
router.post("/", requireRole("admin"), ProductController.create);

/**
 * @openapi
 * /api/products/{id}:
 *   get:
 *     tags: [Products]
 *     summary: Get a product
 *     description: Returns 404 when the product exists but the caller cannot access it.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ProductId'
 *     responses:
 *       200:
 *         description: Product detail
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get("/:id", ProductController.getOne);

/**
 * @openapi
 * /api/products/{id}:
 *   patch:
 *     tags: [Products]
 *     summary: Update a product (admin only)
 *     description: >
 *       Partial update. `code` and `companyId` are immutable after creation.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ProductId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProductRequest'
 *     responses:
 *       200:
 *         description: Product updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       422:
 *         $ref: '#/components/responses/ValidationFailed'
 */
router.patch("/:id", requireRole("admin"), ProductController.update);

export default router;
