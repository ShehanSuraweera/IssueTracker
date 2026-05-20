import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>
  ) {
    super(message);
    this.name = "AppError";
  }
}

interface ErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
    requestId?: string;
  };
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const requestId = req.requestId;

  if (err instanceof AppError) {
    const body: ErrorBody = {
      error: {
        code: err.code,
        message: err.message,
        requestId,
      },
    };
    if (err.fields) body.error.fields = err.fields;
    res.status(err.statusCode).json(body);
    return;
  }

  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    err.issues.forEach((issue) => {
      const key = issue.path.join(".");
      fields[key] = issue.message;
    });

    res.status(422).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "Input validation failed",
        fields,
        requestId,
      },
    });
    return;
  }

  // Unexpected errors
  console.error("[unhandled error]", err);
  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
      requestId,
    },
  });
}
