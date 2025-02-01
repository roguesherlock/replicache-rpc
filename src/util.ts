import type { StandardSchemaV1 } from "@standard-schema/spec"

export type { StandardSchemaV1 as Schema } from "@standard-schema/spec"

export async function validate<T extends StandardSchemaV1>(
  schema: T,
  input: StandardSchemaV1.InferInput<T>,
): Promise<StandardSchemaV1.InferOutput<T>> {
  let result = schema["~standard"].validate(input)
  if (result instanceof Promise) result = await result

  // if the `issues` field exists, the validation failed
  if (result.issues) {
    throw new ValidationError(result.issues)
  }

  return result.value
}

export class ValidationError extends Error {
  constructor(issues: StandardSchemaV1.FailureResult["issues"]) {
    super(JSON.stringify(issues, null, 2))
  }
}
