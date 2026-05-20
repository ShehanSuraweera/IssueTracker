import swaggerJsdoc from "swagger-jsdoc";

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
        description:
          "Register, login, token refresh, logout, and current-user endpoints",
      },
    ],
  },
  apis: ["./src/features/**/*.routes.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
