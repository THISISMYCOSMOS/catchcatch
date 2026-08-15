import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

// A malformed request body is the caller's fault, but a bare schema.parse()
// throws ZodError, which Nest turns into a 500 — telling Core "this service
// broke" when the request was simply invalid. This keeps the two apart: 400
// for a bad body, and the existing 503 mapping (applied inside each
// service's try/catch) for provider and AI-output failures.
//
// Only issue paths and messages are echoed back, never the submitted
// values, so an oversized or sensitive field is not reflected to the caller.
export function parseRequestInput<T extends z.ZodType>(
  schema: T,
  rawInput: unknown,
): z.infer<T> {
  const result = schema.safeParse(rawInput);
  if (result.success) {
    return result.data;
  }
  throw new BadRequestException({
    code: 'INVALID_REQUEST_INPUT',
    issues: result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  });
}
