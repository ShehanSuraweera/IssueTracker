import swaggerJsdoc from "swagger-jsdoc";
import path from "path";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "NewnopDesk API",
      version: "1.0.0",
      description: `
## NewnopDesk — Client Issue Portal API

A multi-tenant issue tracking API built for Newnop, a software agency with
engineering centers in Korea, Sri Lanka, and India.

### Authentication
All endpoints except \`/api/auth/register\` and \`/api/auth/login\` require a
valid **Bearer token** in the \`Authorization\` header.

\`\`\`
Authorization: Bearer <access_token>
\`\`\`

Access tokens are **RS256-signed JWTs** that expire after **15 minutes**.
Use \`/api/auth/refresh\` with your refresh token to obtain a new pair.

### Error format
All error responses follow a consistent envelope:
\`\`\`json
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Human-readable description",
    "fields": { "fieldName": "Field-specific error" }
  }
}
\`\`\`

### Roles
| Role | Description |
|------|-------------|
| \`client_user\` | Client company employee — can raise and track their own issues |
| \`engineer\` | Newnop developer — triages and resolves issues for assigned products |
| \`admin\` | Newnop leadership — full portfolio access and user management |
      `,
      contact: {
        name: "NewnopDesk Engineering",
        email: "admin@newnop.com",
      },
      license: {
        name: "Private",
      },
    },
    servers: [
      {
        url: "http://localhost:4000",
        description: "Local development",
      },
      {
        url: "https://api.newnopdesk.com",
        description: "Production (AWS EC2)",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "RS256-signed JWT. Obtain via /api/auth/login. Expires in 15 minutes.",
        },
      },
      parameters: {
        IssueId: {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "string", example: "42" },
          description: "Issue ID",
        },
        CompanyId: {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "string", example: "1" },
          description: "Company ID",
        },
        ProductId: {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "string", example: "1" },
          description: "Product ID",
        },
        UserId: {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "string", example: "5" },
          description: "User ID",
        },
      },
      responses: {
        Unauthorized: {
          description: "Missing or invalid access token",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        Forbidden: {
          description: "Insufficient permissions for this operation",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        NotFound: {
          description: "Resource not found",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        ValidationFailed: {
          description: "Input validation failed",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ValidationErrorResponse" },
            },
          },
        },
      },
      schemas: {
        // ─── Request bodies ───────────────────────────────────────────────────
        RegisterRequest: {
          type: "object",
          required: ["email", "password", "fullName"],
          properties: {
            email: {
              type: "string",
              format: "email",
              example: "user@apartment-lk.com",
              description: "Must be unique across all users",
            },
            password: {
              type: "string",
              format: "password",
              minLength: 8,
              example: "Secret@2026",
              description:
                "Min 8 characters, at least one uppercase letter and one digit",
            },
            fullName: {
              type: "string",
              minLength: 2,
              maxLength: 120,
              example: "Lakshan Perera",
            },
          },
        },
        LoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: {
              type: "string",
              format: "email",
              example: "feedback@apartment-lk.com",
            },
            password: {
              type: "string",
              format: "password",
              example: "Demo@2026",
            },
          },
        },
        RefreshRequest: {
          type: "object",
          required: ["refreshToken"],
          properties: {
            refreshToken: {
              type: "string",
              example: "a3f8b2e1c4d5...64-char-hex-token",
              description: "Opaque token obtained from login or previous refresh",
            },
          },
        },
        LogoutRequest: {
          type: "object",
          properties: {
            refreshToken: {
              type: "string",
              nullable: true,
              description:
                "If provided, only this token is revoked. Omit to revoke all sessions.",
            },
          },
        },

        // ─── Shared models ────────────────────────────────────────────────────
        UserProfile: {
          type: "object",
          properties: {
            id: {
              type: "string",
              example: "1",
              description: "BigInt serialized as string to avoid JS precision loss",
            },
            email: { type: "string", format: "email", example: "feedback@apartment-lk.com" },
            fullName: { type: "string", example: "Lakshan Perera" },
            role: {
              type: "string",
              enum: ["client_user", "engineer", "admin"],
              example: "client_user",
            },
            companyId: {
              type: "string",
              nullable: true,
              example: "1",
              description: "Set for client_user; null for engineer/admin",
            },
            office: {
              type: "string",
              enum: ["KR", "LK", "IN"],
              nullable: true,
              example: "LK",
              description: "Set for engineer/admin; null for client_user",
            },
            isActive: { type: "boolean", example: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        UserProfileWithCompany: {
          allOf: [
            { $ref: "#/components/schemas/UserProfile" },
            {
              type: "object",
              properties: {
                company: {
                  nullable: true,
                  type: "object",
                  properties: {
                    id: { type: "string", example: "1" },
                    name: { type: "string", example: "Apartment LK" },
                    region: {
                      type: "string",
                      enum: ["KR", "LK", "IN", "GLOBAL"],
                      example: "LK",
                    },
                  },
                },
              },
            },
          ],
        },

        // ─── Response wrappers ────────────────────────────────────────────────
        AuthResponse: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                accessToken: {
                  type: "string",
                  example: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
                  description: "RS256 JWT. Valid for 15 minutes.",
                },
                refreshToken: {
                  type: "string",
                  example: "a3f8b2e1c4d5f6a7b8c9...",
                  description: "Opaque 64-byte hex token. Valid for 7 days.",
                },
                expiresIn: {
                  type: "integer",
                  example: 900,
                  description: "Access token TTL in seconds",
                },
                user: { $ref: "#/components/schemas/UserProfile" },
              },
            },
          },
        },
        MeResponse: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                user: { $ref: "#/components/schemas/UserProfileWithCompany" },
              },
            },
          },
        },

        // ─── Issue enums ──────────────────────────────────────────────────
        IssueStatus: {
          type: "string",
          enum: ["new", "in_progress", "on_hold", "resolved", "closed", "cancelled"],
          example: "new",
        },
        IssueType: {
          type: "string",
          enum: ["bug", "feature_request", "question", "incident"],
          example: "bug",
        },
        ImpactLevel: {
          type: "string",
          enum: ["low", "medium", "high"],
          example: "medium",
        },
        UrgencyLevel: {
          type: "string",
          enum: ["low", "medium", "high"],
          example: "medium",
        },
        PriorityLevel: {
          type: "string",
          enum: ["low", "moderate", "high", "critical"],
          example: "moderate",
        },

        // ─── Issue models ─────────────────────────────────────────────────
        IssueSummary: {
          type: "object",
          description: "Issue summary — returned in list responses",
          properties: {
            id:           { type: "string", example: "42" },
            ticketNumber: { type: "string", example: "APRT-0001" },
            productId:    { type: "string", example: "1" },
            title:        { type: "string", example: "Login page shows 500 on bad password" },
            status:       { $ref: "#/components/schemas/IssueStatus" },
            type:         { $ref: "#/components/schemas/IssueType" },
            priority:     { $ref: "#/components/schemas/PriorityLevel" },
            impact:       { $ref: "#/components/schemas/ImpactLevel" },
            urgency:      { $ref: "#/components/schemas/UrgencyLevel" },
            createdBy:    { type: "string", example: "3" },
            assignedTo:   { type: "string", nullable: true, example: "7" },
            slaDeadline:  { type: "string", format: "date-time", nullable: true },
            resolvedAt:   { type: "string", format: "date-time", nullable: true },
            closedAt:     { type: "string", format: "date-time", nullable: true },
            createdAt:    { type: "string", format: "date-time" },
            updatedAt:    { type: "string", format: "date-time" },
            product: {
              type: "object",
              properties: {
                id:   { type: "string", example: "1" },
                name: { type: "string", example: "ApartmentLK Portal" },
                code: { type: "string", example: "APRT" },
              },
            },
            creator: {
              type: "object",
              properties: {
                id:       { type: "string", example: "3" },
                fullName: { type: "string", example: "Lakshan Perera" },
                email:    { type: "string", format: "email" },
              },
            },
            assignee: {
              nullable: true,
              type: "object",
              properties: {
                id:       { type: "string", example: "7" },
                fullName: { type: "string", example: "Ji-ho Kim" },
                email:    { type: "string", format: "email" },
              },
            },
            _count: {
              type: "object",
              properties: {
                comments:    { type: "integer", example: 3 },
                attachments: { type: "integer", example: 1 },
              },
            },
          },
        },

        IssueDetail: {
          allOf: [
            { $ref: "#/components/schemas/IssueSummary" },
            {
              type: "object",
              properties: {
                description: { type: "string" },
                comments: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id:         { type: "string" },
                      body:       { type: "string" },
                      isInternal: { type: "boolean" },
                      createdAt:  { type: "string", format: "date-time" },
                      user: {
                        type: "object",
                        properties: {
                          id:       { type: "string" },
                          fullName: { type: "string" },
                          role:     { type: "string" },
                        },
                      },
                    },
                  },
                },
                activities: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id:        { type: "string" },
                      fieldName: { type: "string", example: "status" },
                      oldValue:  { type: "string", nullable: true },
                      newValue:  { type: "string", nullable: true },
                      createdAt: { type: "string", format: "date-time" },
                      user: {
                        type: "object",
                        properties: {
                          id:       { type: "string" },
                          fullName: { type: "string" },
                        },
                      },
                    },
                  },
                },
                attachments: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id:        { type: "string" },
                      s3Key:     { type: "string" },
                      filename:  { type: "string" },
                      sizeBytes: { type: "string" },
                      mimeType:  { type: "string" },
                      createdAt: { type: "string", format: "date-time" },
                      uploader: {
                        type: "object",
                        properties: {
                          id:       { type: "string" },
                          fullName: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          ],
        },

        // ─── Issue request bodies ─────────────────────────────────────────
        CreateIssueRequest: {
          type: "object",
          required: ["productId", "title", "description", "type"],
          properties: {
            productId:   { type: "string", example: "1" },
            title:       { type: "string", maxLength: 200, example: "Login fails with 500" },
            description: { type: "string", example: "Reproducible on every login attempt." },
            type:        { $ref: "#/components/schemas/IssueType" },
            impact:      { $ref: "#/components/schemas/ImpactLevel" },
            urgency:     { $ref: "#/components/schemas/UrgencyLevel" },
            slaDeadline: { type: "string", format: "date-time", nullable: true },
          },
        },

        UpdateIssueRequest: {
          type: "object",
          minProperties: 1,
          properties: {
            title:       { type: "string", maxLength: 200 },
            description: { type: "string" },
            type:        { $ref: "#/components/schemas/IssueType" },
            status:      { $ref: "#/components/schemas/IssueStatus" },
            impact:      { $ref: "#/components/schemas/ImpactLevel" },
            urgency:     { $ref: "#/components/schemas/UrgencyLevel" },
            slaDeadline: { type: "string", format: "date-time", nullable: true },
          },
        },

        AssignIssueRequest: {
          type: "object",
          required: ["assigneeId"],
          properties: {
            assigneeId: { type: "string", example: "7", description: "ID of an active engineer" },
          },
        },

        // ─── Issue response wrappers ──────────────────────────────────────
        IssueListResponse: {
          type: "object",
          properties: {
            data: { type: "array", items: { $ref: "#/components/schemas/IssueSummary" } },
            pagination: {
              type: "object",
              properties: {
                page:       { type: "integer", example: 1 },
                limit:      { type: "integer", example: 20 },
                total:      { type: "integer", example: 150 },
                totalPages: { type: "integer", example: 8 },
              },
            },
          },
        },

        IssueDetailResponse: {
          type: "object",
          properties: {
            data: { $ref: "#/components/schemas/IssueDetail" },
          },
        },

        IssueStatsResponse: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                summary: {
                  type: "object",
                  properties: {
                    totalOpen:         { type: "integer", example: 38 },
                    critical:          { type: "integer", example: 4  },
                    atSlaRisk:         { type: "integer", example: 7  },
                    resolvedThisWeek:  { type: "integer", example: 12 },
                  },
                },
                byStatus:   { type: "object", additionalProperties: { type: "integer" }, example: { new: 10, in_progress: 20, on_hold: 8 } },
                byPriority: { type: "object", additionalProperties: { type: "integer" }, example: { low: 15, moderate: 12, high: 8, critical: 3 } },
                byRegion:   { type: "object", additionalProperties: { type: "integer" }, example: { LK: 20, KR: 10, IN: 8 } },
              },
            },
          },
        },

        IssueExportRow: {
          type: "object",
          properties: {
            id:             { type: "string" },
            ticketNumber:   { type: "string" },
            product:        { type: "string" },
            productCode:    { type: "string" },
            title:          { type: "string" },
            status:         { type: "string" },
            type:           { type: "string" },
            priority:       { type: "string" },
            impact:         { type: "string" },
            urgency:        { type: "string" },
            createdBy:      { type: "string" },
            createdByEmail: { type: "string" },
            assignedTo:     { type: "string" },
            slaDeadline:    { type: "string" },
            resolvedAt:     { type: "string" },
            closedAt:       { type: "string" },
            createdAt:      { type: "string" },
            updatedAt:      { type: "string" },
          },
        },

        // ─── Comment / Attachment models ─────────────────────────────────────
        CreateCommentRequest: {
          type: "object",
          required: ["body"],
          properties: {
            body:       { type: "string", maxLength: 10000, example: "Reproduced on staging. Deploying hotfix." },
            isInternal: { type: "boolean", default: false, description: "Hidden from client_user when true" },
          },
        },
        CommentResponse: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                id:         { type: "string" },
                issueId:    { type: "string" },
                userId:     { type: "string" },
                body:       { type: "string" },
                isInternal: { type: "boolean" },
                createdAt:  { type: "string", format: "date-time" },
                user: {
                  type: "object",
                  properties: {
                    id:       { type: "string" },
                    fullName: { type: "string" },
                    role:     { type: "string" },
                  },
                },
              },
            },
          },
        },
        PresignUploadRequest: {
          type: "object",
          required: ["filename", "mimeType", "sizeBytes"],
          properties: {
            filename:  { type: "string", maxLength: 255, example: "screenshot.png" },
            mimeType:  { type: "string", maxLength: 127, example: "image/png" },
            sizeBytes: { type: "integer", maximum: 26214400, example: 204800, description: "Max 25 MB" },
          },
        },
        PresignUploadResponse: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                uploadUrl: { type: "string", description: "Presigned S3 PUT URL, valid for 5 minutes" },
                s3Key:     { type: "string", example: "issues/42/uuid/screenshot.png" },
                expiresIn: { type: "integer", example: 300 },
              },
            },
          },
        },
        ConfirmAttachmentRequest: {
          type: "object",
          required: ["s3Key", "filename", "mimeType", "sizeBytes"],
          properties: {
            s3Key:     { type: "string", maxLength: 512, example: "issues/42/uuid/screenshot.png" },
            filename:  { type: "string", maxLength: 255, example: "screenshot.png" },
            mimeType:  { type: "string", maxLength: 127, example: "image/png" },
            sizeBytes: { type: "integer", example: 204800 },
          },
        },
        AttachmentResponse: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                id:         { type: "string" },
                issueId:    { type: "string" },
                s3Key:      { type: "string" },
                filename:   { type: "string" },
                mimeType:   { type: "string" },
                sizeBytes:  { type: "string" },
                uploadedBy: { type: "string" },
                createdAt:  { type: "string", format: "date-time" },
                uploader: {
                  type: "object",
                  properties: {
                    id:       { type: "string" },
                    fullName: { type: "string" },
                  },
                },
              },
            },
          },
        },
        DownloadUrlResponse: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                id:          { type: "string" },
                filename:    { type: "string" },
                mimeType:    { type: "string" },
                sizeBytes:   { type: "string" },
                downloadUrl: { type: "string", description: "Presigned S3 GET URL, valid for 15 minutes" },
              },
            },
          },
        },

        // ─── Company models ───────────────────────────────────────────────────
        CreateCompanyRequest: {
          type: "object",
          required: ["name", "contactEmail", "region"],
          properties: {
            name:         { type: "string", maxLength: 120, example: "Apartment LK" },
            contactEmail: { type: "string", format: "email", example: "contact@apartment-lk.com" },
            region:       { type: "string", enum: ["KR", "LK", "IN", "GLOBAL"], example: "LK" },
          },
        },
        UpdateCompanyRequest: {
          type: "object",
          minProperties: 1,
          properties: {
            name:         { type: "string", maxLength: 120 },
            contactEmail: { type: "string", format: "email" },
            region:       { type: "string", enum: ["KR", "LK", "IN", "GLOBAL"] },
          },
        },
        CompanyResponse: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                id:           { type: "string", example: "1" },
                name:         { type: "string", example: "Apartment LK" },
                contactEmail: { type: "string", format: "email" },
                region:       { type: "string", enum: ["KR", "LK", "IN", "GLOBAL"] },
                createdAt:    { type: "string", format: "date-time" },
              },
            },
          },
        },
        CompanyListResponse: {
          type: "object",
          properties: {
            data: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id:           { type: "string" },
                  name:         { type: "string" },
                  contactEmail: { type: "string" },
                  region:       { type: "string" },
                  createdAt:    { type: "string", format: "date-time" },
                  _count: {
                    type: "object",
                    properties: {
                      products: { type: "integer" },
                      users:    { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
        CompanyDetailResponse: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                id:           { type: "string" },
                name:         { type: "string" },
                contactEmail: { type: "string" },
                region:       { type: "string" },
                createdAt:    { type: "string", format: "date-time" },
                _count: {
                  type: "object",
                  properties: { users: { type: "integer" } },
                },
                products: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id:           { type: "string" },
                      name:         { type: "string" },
                      code:         { type: "string" },
                      owningOffice: { type: "string" },
                      description:  { type: "string", nullable: true },
                      createdAt:    { type: "string", format: "date-time" },
                      _count: {
                        type: "object",
                        properties: { issues: { type: "integer" } },
                      },
                    },
                  },
                },
              },
            },
          },
        },

        // ─── Product models ───────────────────────────────────────────────────
        CreateProductRequest: {
          type: "object",
          required: ["companyId", "name", "code", "owningOffice"],
          properties: {
            companyId:    { type: "string", example: "1" },
            name:         { type: "string", maxLength: 120, example: "ApartmentLK Web Portal" },
            code:         { type: "string", maxLength: 8, pattern: "^[A-Z0-9]+$", example: "APTWEB" },
            owningOffice: { type: "string", enum: ["KR", "LK", "IN"], example: "LK" },
            description:  { type: "string", maxLength: 5000, nullable: true },
          },
        },
        UpdateProductRequest: {
          type: "object",
          minProperties: 1,
          properties: {
            name:         { type: "string", maxLength: 120 },
            owningOffice: { type: "string", enum: ["KR", "LK", "IN"] },
            description:  { type: "string", maxLength: 5000, nullable: true },
          },
        },
        ProductResponse: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                id:           { type: "string", example: "2" },
                companyId:    { type: "string", example: "1" },
                name:         { type: "string", example: "ApartmentLK Web Portal" },
                code:         { type: "string", example: "APTWEB" },
                owningOffice: { type: "string", enum: ["KR", "LK", "IN"] },
                description:  { type: "string", nullable: true },
                createdAt:    { type: "string", format: "date-time" },
                company: {
                  type: "object",
                  properties: {
                    id:     { type: "string" },
                    name:   { type: "string" },
                    region: { type: "string" },
                  },
                },
                _count: {
                  type: "object",
                  properties: { issues: { type: "integer" } },
                },
              },
            },
          },
        },
        ProductListResponse: {
          type: "object",
          properties: {
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/ProductResponse/properties/data" },
            },
          },
        },

        // ─── User models ──────────────────────────────────────────────────────
        CreateUserRequest: {
          type: "object",
          required: ["email", "password", "fullName", "role"],
          properties: {
            email:     { type: "string", format: "email", example: "engineer@newnop.com" },
            password:  { type: "string", format: "password", minLength: 8 },
            fullName:  { type: "string", maxLength: 120, example: "Ji-ho Kim" },
            role:      { type: "string", enum: ["client_user", "engineer", "admin"] },
            companyId: { type: "string", example: "1", description: "Required for client_user" },
            office:    { type: "string", enum: ["KR", "LK", "IN"], description: "For engineer/admin" },
          },
        },
        UpdateUserRequest: {
          type: "object",
          minProperties: 1,
          properties: {
            email:     { type: "string", format: "email" },
            fullName:  { type: "string", maxLength: 120 },
            role:      { type: "string", enum: ["client_user", "engineer", "admin"] },
            companyId: { type: "string", nullable: true },
            office:    { type: "string", enum: ["KR", "LK", "IN"], nullable: true },
            isActive:  { type: "boolean", description: "Set false to deactivate without deleting" },
          },
        },
        ChangePasswordRequest: {
          type: "object",
          required: ["currentPassword", "newPassword"],
          properties: {
            currentPassword: { type: "string", format: "password" },
            newPassword:     { type: "string", format: "password", minLength: 8 },
          },
        },
        GrantProductAccessRequest: {
          type: "object",
          required: ["productId"],
          properties: {
            productId: { type: "string", example: "2" },
          },
        },
        UserResponse: {
          type: "object",
          properties: {
            data: { $ref: "#/components/schemas/UserProfile" },
          },
        },
        UserListResponse: {
          type: "object",
          properties: {
            data: {
              type: "array",
              items: {
                allOf: [
                  { $ref: "#/components/schemas/UserProfile" },
                  {
                    type: "object",
                    properties: {
                      company: {
                        nullable: true,
                        type: "object",
                        properties: {
                          id:   { type: "string" },
                          name: { type: "string" },
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
        UserDetailResponse: {
          type: "object",
          properties: {
            data: {
              allOf: [
                { $ref: "#/components/schemas/UserProfileWithCompany" },
                {
                  type: "object",
                  properties: {
                    productAccess: {
                      type: "array",
                      description: "Products this engineer has access to (only present on admin GET /:id)",
                      items: {
                        type: "object",
                        properties: {
                          id:        { type: "string" },
                          name:      { type: "string" },
                          code:      { type: "string" },
                          companyId: { type: "string" },
                        },
                      },
                    },
                  },
                },
              ],
            },
          },
        },
        ProductAccessResponse: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                userId:    { type: "string" },
                productId: { type: "string" },
                product: {
                  type: "object",
                  properties: {
                    id:   { type: "string" },
                    name: { type: "string" },
                    code: { type: "string" },
                  },
                },
              },
            },
          },
        },

        // ─── Error responses ──────────────────────────────────────────────────
        ErrorResponse: {
          type: "object",
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: {
                  type: "string",
                  example: "INVALID_CREDENTIALS",
                  description: "Machine-readable error code",
                },
                message: {
                  type: "string",
                  example: "Invalid email or password",
                },
                requestId: {
                  type: "string",
                  nullable: true,
                  description: "Correlation ID for log tracing",
                },
              },
            },
          },
        },
        ValidationErrorResponse: {
          type: "object",
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string", example: "VALIDATION_FAILED" },
                message: { type: "string", example: "Input validation failed" },
                fields: {
                  type: "object",
                  additionalProperties: { type: "string" },
                  example: {
                    email: "Must be a valid email address",
                    password: "Password must be at least 8 characters",
                  },
                },
                requestId: { type: "string", nullable: true },
              },
            },
          },
        },
      },
    },
    tags: [
      {
        name: "Authentication",
        description: "Register, login, token refresh, logout, and current-user endpoints",
      },
      {
        name: "Issues",
        description:
          "Create, track, and manage client issues. Includes ITIL priority matrix, " +
          "status transitions, activity audit log, engineer assignment, and admin dashboard.",
      },
      {
        name: "Companies",
        description: "Manage client companies (tenants). Admin only.",
      },
      {
        name: "Products",
        description: "Manage products. Creation and updates are admin-only; listing is role-filtered.",
      },
      {
        name: "Users",
        description:
          "User management and self-service. Admins can create/update users and manage " +
          "engineer product access. All authenticated users can view their own profile and change their password.",
      },
    ],
  },
  apis: [path.resolve(__dirname, "../features/**/*.routes.{ts,js}")],
};

export const swaggerSpec = swaggerJsdoc(options);

const paths = Object.keys((swaggerSpec as { paths?: Record<string, unknown> }).paths ?? {});
