export type FieldError = { field: string; message: string };

export type ErrorBody = {
  code: number;
  message: string;
  description: string;
  moreInfo: string;
  error: Array<FieldError & { code: number }>;
};

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: number,
    message: string,
    readonly description = message,
    readonly fieldErrors: FieldError[] = [],
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function validation(
  fields: FieldError[],
  message = "Validation failed",
): AppError {
  return new AppError(
    400,
    40001,
    message,
    "One or more request fields are invalid.",
    fields,
  );
}

export function invalidRequest(): AppError {
  return new AppError(
    400,
    40001,
    "Invalid request",
    "The request could not be processed.",
  );
}

export function notFound(message = "Resource not found"): AppError {
  return new AppError(404, 40401, message);
}

export function methodNotAllowed(): AppError {
  return new AppError(405, 40501, "Invalid HTTP method");
}

export function unauthorized(
  code: 40101 | 40102 | 40103,
  message = "Authentication required",
): AppError {
  return new AppError(401, code, message);
}

export function forbidden(
  code: 40301 | 40302,
  message = "Forbidden",
): AppError {
  return new AppError(403, code, message);
}

export function notAcceptable(): AppError {
  return new AppError(406, 40601, "Not acceptable");
}

export function conflict(code: 40901 | 40902, message: string): AppError {
  return new AppError(409, code, message);
}

export function preconditionFailed(): AppError {
  return new AppError(412, 41201, "Precondition failed");
}

export function unsupportedMediaType(): AppError {
  return new AppError(415, 41501, "Unsupported media type");
}

export function unprocessable(
  message = "Referenced entity does not exist",
): AppError {
  return new AppError(422, 42201, message);
}

export function internalError(): AppError {
  return new AppError(500, 50000, "Internal Server Error");
}

export function postgresErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const code = (current as Error & { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as Error & { cause?: unknown }).cause;
  }
  return undefined;
}

export function toErrorBody(error: AppError): ErrorBody {
  return {
    code: error.code,
    message: error.message,
    description: error.description,
    moreInfo: "/docs#section/Errors",
    error: error.fieldErrors.map((item) => ({ ...item, code: error.code })),
  };
}
