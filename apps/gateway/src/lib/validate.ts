import type { FastifyReply } from 'fastify';
import type { ZodTypeAny, z } from 'zod';

/**
 * Xác thực body/params bằng Zod. Trả về dữ liệu đã parse, hoặc gửi 400 và trả về null.
 */
export function parseOr400<S extends ZodTypeAny>(
  schema: S,
  input: unknown,
  reply: FastifyReply
): z.infer<S> | null {
  const result = schema.safeParse(input);
  if (!result.success) {
    reply.status(400).send({ error: 'invalid_request', issues: result.error.issues });
    return null;
  }
  return result.data;
}

/**
 * Nguyên tắc 6: mọi phản hồi đều phải khớp contract. Lệch contract là lỗi phía server (500),
 * không được lặng lẽ gửi dữ liệu sai hình dạng xuống client.
 */
export function respond<S extends ZodTypeAny>(schema: S, data: z.input<S>): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const err = new Error('Phản hồi vi phạm contract') as Error & { statusCode: number; issues: unknown };
    err.statusCode = 500;
    err.issues = result.error.issues;
    throw err;
  }
  return result.data;
}
