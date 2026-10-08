import type { Json } from '@/types/database.types';

export function redactMetadata(value: Json, depth = 0): Json {
  if (depth > 8) return '[truncated]';
  if (Array.isArray(value))
    return value.slice(0, 100).map((item) => redactMetadata(item, depth + 1));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /secret|password|token|api.?key|authorization|\bpin\b/i.test(key)
          ? '[redacted]'
          : redactMetadata(item ?? null, depth + 1),
      ])
    );
  return value;
}
