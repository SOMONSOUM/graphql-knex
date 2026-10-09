export const toSnakeCase = (value: string): string =>
  value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

export const toCamelCase = (value: string): string =>
  value.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());

const isRowObject = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !Buffer.isBuffer(value);

/** Converts top-level keys of result rows to camelCase. Nested values (JSON columns) are untouched. */
export function mapRowKeys(result: unknown): unknown {
  if (Array.isArray(result)) return result.map(mapRowKeys);
  if (isRowObject(result)) {
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result))
      mapped[toCamelCase(key)] = value;
    return mapped;
  }
  return result;
}
