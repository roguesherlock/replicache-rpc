import { validate, type Schema } from "./util"

type MutationArgs<S extends Schema> = Schema.InferOutput<S>

type MutationFnIn<Input, Output> = ((
  args: MutationArgs<Schema<Input, Output>>,
) => Promise<void> | void) & {
  schema: Schema
}

type MutationFnInWithoutSchema<Input, Output> = (
  args: MutationArgs<Schema<Input, Output>>,
) => Promise<void> | void

type MutatorDef<Name extends string, Input, Output> = {
  name: Name
  schema: Schema<Input, Output>
  fn: MutationFnIn<Input, Output>
}

/**
 * ReplicacheServer is a helper class for implementing replicache protocol in typescript backend that provides a type-safe way to define and execute mutations with schema validation. There's and accompanying `ReplicacheClient` to help you implment the mutations in the client and provide end-to-end type saftey.
 *
 * @example
 * ```typescript
 * import { type } from "arktype" // Also supports other schema libraries like zed and valibot.
 * import { ReplicacheServer } from "./server"
 *
 * // Define schemas for your mutations
 * const todoSchema = type({
 *   name: "string",
 *   priority: "number"
 * })
 *
 * const userSchema = type({
 *   id: "string",
 *   email: "string"
 * })
 *
 * // Create a server instance and chain mutations
 * const server = new ReplicacheServer()
 *   .mutation("createTodo", todoSchema, async (input) => {
 *     // Handle todo creation
 *     console.log(`Creating todo: ${input.name}`)
 *   })
 *   .mutation("createUser", userSchema, async (input) => {
 *     // Handle user creation
 *     console.log(`Creating user: ${input.email}`)
 *   })
 *
 * // Execute mutations
 * await server.mutate("createTodo", { name: "Buy groceries", priority: 1 })
 * await server.mutate("createUser", { id: "1", email: "test@example.com" })
 */
export class ReplicacheServer<
  Mutators extends Record<string, MutatorDef<string, any, any>> = {},
> {
  #mutators: Mutators

  constructor(mutators: Mutators = {} as Mutators) {
    this.#mutators = mutators
  }

  mutation<const Name extends string, const Input, const Output>(
    ...args:
      | [Name, MutationFnIn<Input, Output>]
      | [Name, Schema<Input, Output>, MutationFnInWithoutSchema<Input, Output>]
  ): ReplicacheServer<
    Mutators & { [K in Name]: MutatorDef<Name, Input, Output> }
  > {
    const mutators: Mutators & {
      [K in Name]: MutatorDef<Name, Input, Output>
    } = {
      ...this.#mutators,
      [args[0]]: {
        name: args[0],
        fn: args.length === 3 ? args[2] : args[1],
        schema: args.length === 3 ? args[1] : args[1].schema,
      },
    } as never
    return new ReplicacheServer(mutators)
  }

  async mutate(name: keyof Mutators, args: unknown): Promise<void> {
    const mutation = this.#mutators[name]
    if (!mutation) {
      throw new MutationNotFoundError(name as string)
    }
    const input = await validate(mutation.schema, args)
    return Promise.resolve(mutation.fn(input))
  }
}

class MutationNotFoundError extends Error {
  constructor(name: string) {
    super(`Unknown mutation: ${name}`)
  }
}

export type ExtractServerMutations<T> =
  T extends ReplicacheServer<infer M> ? M : never

export type AnyReplicacheServer = ReplicacheServer<{
  [key: string]: MutatorDef<string, any, any>
}>

export type AnyMutators = ExtractServerMutations<AnyReplicacheServer>
