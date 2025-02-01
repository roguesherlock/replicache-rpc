import {
  Replicache,
  type MutatorReturn,
  type ReadonlyJSONValue,
  type ReadTransaction,
  type ReplicacheOptions,
  type WriteTransaction,
} from "replicache"
import type { MaybePromise } from "./types"
import { validate, type Schema } from "./util"

type MutationFnIn<
  SInput,
  SOutput,
  Output extends
    MutatorReturn<ReadonlyJSONValue> = MutatorReturn<ReadonlyJSONValue>,
  S extends Schema<SInput, SOutput> = Schema<SInput, SOutput>,
> = ((
  tx: WriteTransaction,
  args: Schema.InferOutput<S>,
) => Promise<Output> | Output) & {
  schema: S
}

type MutationFnInWithoutSchema<
  SInput,
  SOutput,
  Output extends
    MutatorReturn<ReadonlyJSONValue> = MutatorReturn<ReadonlyJSONValue>,
  S extends Schema<SInput, SOutput> = Schema<SInput, SOutput>,
> = (
  tx: WriteTransaction,
  args: Schema.InferOutput<S>,
) => Promise<Output> | Output

type MutationFnOut<
  SInput,
  SOutput,
  Output = any,
  S extends Schema<SInput, SOutput> = Schema<SInput, SOutput>,
> = (args: Schema.InferInput<S>) => Promise<Output> | Output

export type MutatorDef<
  Name extends string,
  SInput,
  SOutput,
  Output extends
    MutatorReturn<ReadonlyJSONValue> = MutatorReturn<ReadonlyJSONValue>,
  S extends Schema<SInput, SOutput> = Schema<SInput, SOutput>,
> = {
  name: Name
  schema: S
  fn: MutationFnIn<SInput, SOutput, Output, S>
}

type QueryFnIn<
  SInput,
  SOutput,
  Output = MaybePromise<ReadonlyJSONValue>,
  S extends Schema<SInput, SOutput> = Schema<SInput, SOutput>,
> = (tx: ReadTransaction, args: Schema.InferOutput<S>) => Output

type QueryFnOut<
  SInput,
  SOutput,
  Output extends MaybePromise<ReadonlyJSONValue>,
  S extends Schema<SInput, SOutput> = Schema<SInput, SOutput>,
> = (input: Schema.InferInput<S>) => Output

type QueryDef<
  Name extends string,
  SInput,
  SOutput,
  Output extends MaybePromise<ReadonlyJSONValue>,
  S extends Schema<SInput, SOutput> = Schema<SInput, SOutput>,
> = {
  name: Name
  schema: S
  fn: QueryFnIn<SInput, SOutput, Output, S>
}

type AnyQueries = Record<string, QueryDef<string, any, any, any>>
type AnyMutators = Record<string, MutatorDef<string, any, any, any>>

type ClientAPI<M extends AnyMutators, Q extends AnyQueries> = {
  rep: Replicache<{
    [K in keyof M]: M[K] extends MutatorDef<
      any,
      infer SInput,
      any,
      infer Output extends MutatorReturn<ReadonlyJSONValue>,
      any
    >
      ? (tx: WriteTransaction, input: SInput) => Output
      : never
  }>
  query: {
    [K in keyof Q]: Q[K] extends QueryDef<
      any,
      infer SInput,
      infer SOutput,
      infer Output,
      infer S
    >
      ? ((tx: ReadTransaction, args: Schema.InferOutput<S>) => Output) & {
          once: QueryFnOut<SInput, SOutput, Output, S>
        }
      : never
  }
  mutate: {
    [K in keyof M]: M[K] extends MutatorDef<
      any,
      infer SInput,
      infer SOutput,
      infer Output,
      infer S
    >
      ? MutationFnOut<SInput, SOutput, Output, S>
      : never
  }
}

type ReplicacheClientOptions = Omit<ReplicacheOptions<any>, "mutators">

/**
 * ReplicacheClient provides a type-safe builder pattern for creating Replicache clients
 * with strongly-typed mutations and queries.
 *
 * @example
 * ```typescript
 * // Define your schemas (using zod or other schema validators)
 * const todoSchema = z.object({
 *   id: z.string(),
 *   text: z.string(),
 *   completed: z.boolean()
 * });
 *
 * // Create a client
 * const client = new ReplicacheClient({ name: "todo-app" })
 *   // Add mutations
 *   .mutation(
 *     "createTodo",
 *     todoSchema,
 *     async (tx, todo) => {
 *       await tx.put(`todo/${todo.id}`, todo);
 *     }
 *   )
 *   // Add queries
 *   .query(
 *     "getTodos",
 *     z.void(),
 *     async (tx) => {
 *       const todos = [];
 *       for await (const [_, todo] of tx.scan({ prefix: "todo/" })) {
 *         todos.push(todo);
 *       }
 *       return todos;
 *     }
 *   )
 *   .build();
 *
 * // Use the typed client
 * await client.mutate.createTodo({
 *   id: "1",
 *   text: "Buy milk",
 *   completed: false
 * });
 *
 * // Query data
 * const todos = await client.query.getTodos.once();
 * ```
 *
 * @template Mutators - Record of mutation definitions
 * @template Queries - Record of query definitions
 */
export class ReplicacheClient<
  const Mutators extends AnyMutators = {},
  const Queries extends AnyQueries = {},
  const RequiredMutators extends AnyMutators = {},
> {
  #queries: Queries
  #mutators: Mutators
  #options: ReplicacheClientOptions

  constructor(
    options: ReplicacheClientOptions,
    queries: Queries = {} as Queries,
    mutators: Mutators = {} as Mutators,
  ) {
    this.#options = options
    this.#queries = queries
    this.#mutators = mutators
  }

  mutation<
    const Name extends string,
    const SInput,
    const SOutput,
    const Output extends
      MutatorReturn<ReadonlyJSONValue> = MutatorReturn<ReadonlyJSONValue>,
  >(
    ...args:
      | [Name, MutationFnIn<SInput, SOutput, Output>]
      | [
          Name,
          Schema<SInput, SOutput>,
          MutationFnInWithoutSchema<SInput, SOutput, Output>,
        ]
  ): ReplicacheClient<
    Mutators & { [K in Name]: MutatorDef<Name, SInput, SOutput, Output> },
    Queries
  > {
    const mutators: Mutators & {
      [K in Name]: MutatorDef<Name, SInput, SOutput, Output>
    } = {
      ...this.#mutators,
      [args[0]]: {
        name: args[0],
        fn: args.length === 3 ? args[2] : args[1],
        schema: args.length === 3 ? args[1] : args[1].schema,
      },
    }
    return new ReplicacheClient(this.#options, this.#queries, mutators)
  }

  query<
    const Name extends string,
    const SInput,
    const SOutput,
    const Output extends MaybePromise<ReadonlyJSONValue>,
  >(
    name: Name,
    schema: Schema<SInput, SOutput>,
    queryFn: QueryFnIn<SInput, SOutput, Output>,
  ): ReplicacheClient<
    Mutators,
    Queries & { [K in Name]: QueryDef<Name, SInput, SOutput, Output> }
  > {
    const queries: Queries & {
      [K in Name]: QueryDef<Name, SInput, SOutput, Output>
    } = {
      ...this.#queries,
      [name]: {
        name,
        schema,
        fn: queryFn,
      },
    }
    return new ReplicacheClient(this.#options, queries, this.#mutators)
  }

  build(): ClientAPI<Mutators, Queries> {
    // Force a compile-time error if a required mutation was not implemented.
    type _EnsureAllMutatorsImplemented = [keyof RequiredMutators] extends [
      keyof Mutators,
    ]
      ? true
      : never

    type ExpectedMutators = {
      [K in keyof Mutators]: Mutators[K] extends MutatorDef<
        any,
        infer SInput,
        any,
        infer Output,
        any
      >
        ? (tx: WriteTransaction, input: SInput) => Output
        : never
    }

    const builtMutators: ExpectedMutators = Object.fromEntries(
      Object.entries(this.#mutators).map(([key, mutatorDef]) => {
        return [
          key,
          async (
            tx: WriteTransaction,
            input: Schema.InferInput<typeof mutatorDef.schema>,
          ) => mutatorDef.fn(tx, await validate(mutatorDef.schema, input)),
        ]
      }),
    ) as never

    const rep: ClientAPI<Mutators, Queries>["rep"] =
      new Replicache<ExpectedMutators>({
        ...this.#options,
        mutators: builtMutators,
      })

    const query: ClientAPI<Mutators, Queries>["query"] = Object.fromEntries(
      Object.entries(this.#queries).map(([key, queryDef]) => {
        async function queryFn(
          tx: ReadTransaction,
          input: Schema.InferInput<typeof queryDef.schema>,
        ) {
          return queryDef.fn(tx, await validate(queryDef.schema, input))
        }
        queryFn.once = async function once(
          input: Schema.InferInput<typeof queryDef.schema>,
        ) {
          return rep.query<ReturnType<typeof queryDef.fn>>(
            async (tx: ReadTransaction) => {
              return queryDef.fn(tx, await validate(queryDef.schema, input))
            },
          )
        }
        return [key, queryFn]
      }),
    ) as never

    const mutate: ClientAPI<Mutators, Queries>["mutate"] = Object.fromEntries(
      Object.entries(this.#mutators).map(([key, mutatorDef]) => {
        return [
          key,
          async (input: Schema.InferInput<typeof mutatorDef.schema>) => {
            const mutation = rep.mutate[key]
            if (!mutation) {
              throw new Error("Mutation not found")
            }
            return mutation(await validate(mutatorDef.schema, input))
          },
        ]
      }),
    ) as never

    return {
      rep,
      query,
      mutate,
    }
  }
}

export type MakeClientAPI<C extends ReplicacheClient<AnyMutators, AnyQueries>> =
  C extends ReplicacheClient<infer M, infer Q> ? ClientAPI<M, Q> : never

export interface Register {
  // client: ReplicacheClient
}

export type AnyReplicacheClientAPI = ClientAPI<AnyMutators, AnyQueries>

export type ReplicacheClientAPI = Register extends {
  client: infer C extends AnyReplicacheClientAPI
}
  ? C
  : AnyReplicacheClientAPI

// Helper function to create a type-safe client.
// The third generic (RequiredMutators) receives the ServerMutations.
export function initClient<const ServerMutations extends AnyMutators>(
  options: ReplicacheClientOptions,
) {
  return new ReplicacheClient<{}, {}, ServerMutations>(options)
}
