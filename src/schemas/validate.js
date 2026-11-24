// ===== FORM VALIDATION =====
// validate(schema, values) -> the first error message (in schema order) or null when the values pass.
// Form schemas carry the exact Spanish messages the UI shows, so components never import zod.

export function validate(schema, values) {
  const result = schema.safeParse(values);
  return result.success ? null : result.error.issues[0].message;
}
