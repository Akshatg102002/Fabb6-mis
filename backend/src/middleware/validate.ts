import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

interface ValidationTargets {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export function validate(targets: ValidationTargets) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: Record<string, unknown> = {};
    let hasErrors = false;

    if (targets.body) {
      const result = targets.body.safeParse(req.body);
      if (!result.success) {
        errors['body'] = formatZodError(result.error);
        hasErrors = true;
      } else {
        req.body = result.data;
      }
    }

    if (targets.query) {
      const result = targets.query.safeParse(req.query);
      if (!result.success) {
        errors['query'] = formatZodError(result.error);
        hasErrors = true;
      } else {
        req.query = result.data as Record<string, string>;
      }
    }

    if (targets.params) {
      const result = targets.params.safeParse(req.params);
      if (!result.success) {
        errors['params'] = formatZodError(result.error);
        hasErrors = true;
      }
    }

    if (hasErrors) {
      res.status(400).json({ error: 'Validation failed', details: errors });
      return;
    }

    next();
  };
}

function formatZodError(error: ZodError): { field: string; message: string }[] {
  return error.errors.map((e) => ({
    field: e.path.join('.'),
    message: e.message,
  }));
}
