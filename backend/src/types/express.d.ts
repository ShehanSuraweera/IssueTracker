import { UserRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: bigint;
        email: string;
        role: UserRole;
        companyId: bigint | null;
      };
      requestId?: string;
    }
  }
}

export {};
