import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { parseRequestInput } from './request-input';

const schema = z.object({
  brand: z.string().max(5),
  nested: z.object({ value: z.string() }),
});

describe('parseRequestInput', () => {
  it('returns the parsed value when the input is valid', () => {
    expect(parseRequestInput(schema, { brand: 'ok', nested: { value: 'v' } }))
      .toEqual({ brand: 'ok', nested: { value: 'v' } });
  });

  it('throws a 400, not a 500, when the input is invalid', () => {
    expect(() => parseRequestInput(schema, { brand: 'too long' }))
      .toThrow(BadRequestException);
  });

  it('reports issue paths without echoing the submitted values back', () => {
    const oversized = 'A'.repeat(100_000);
    try {
      parseRequestInput(schema, { brand: oversized, nested: { value: 1 } });
      throw new Error('expected a BadRequestException');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse() as {
        code: string;
        issues: Array<{ path: string; message: string }>;
      };
      expect(body.code).toBe('INVALID_REQUEST_INPUT');
      expect(body.issues.map((issue) => issue.path).sort()).toEqual(['brand', 'nested.value']);
      expect(JSON.stringify(body)).not.toContain(oversized);
    }
  });
});
