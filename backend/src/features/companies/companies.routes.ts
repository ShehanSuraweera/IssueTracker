import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate";
import * as CompanyController from "./companies.controller";

const router = Router();

router.use(authenticate);
router.use(requireRole("admin"));

/**
 * @openapi
 * /api/companies:
 *   get:
 *     tags: [Companies]
 *     summary: List all companies (admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Company list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CompanyListResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get("/", CompanyController.list);

/**
 * @openapi
 * /api/companies:
 *   post:
 *     tags: [Companies]
 *     summary: Create a company (admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCompanyRequest'
 *           example:
 *             name: "Apartment LK"
 *             contactEmail: "contact@apartment-lk.com"
 *             region: "LK"
 *     responses:
 *       201:
 *         description: Company created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CompanyResponse'
 *       409:
 *         description: Contact email already in use
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         $ref: '#/components/responses/ValidationFailed'
 */
router.post("/", CompanyController.create);

/**
 * @openapi
 * /api/companies/{id}:
 *   get:
 *     tags: [Companies]
 *     summary: Get a company with its products (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/CompanyId'
 *     responses:
 *       200:
 *         description: Company detail
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CompanyDetailResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get("/:id", CompanyController.getOne);

/**
 * @openapi
 * /api/companies/{id}:
 *   patch:
 *     tags: [Companies]
 *     summary: Update a company (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/CompanyId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateCompanyRequest'
 *     responses:
 *       200:
 *         description: Company updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CompanyResponse'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: Contact email already in use
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         $ref: '#/components/responses/ValidationFailed'
 */
router.patch("/:id", CompanyController.update);

export default router;
