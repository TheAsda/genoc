/**
 * The eight OpenAPI Operation Object HTTP methods, in canonical generation
 * order (the order methods appear in generated clients).
 *
 * Single source shared by the analyzer (path-item iteration) and the
 * validators (per-operation checks) — do not inline local copies.
 */
export const HTTP_METHODS = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
  'trace',
] as const;
