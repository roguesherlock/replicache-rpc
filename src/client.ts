import {
  Replicache,
  type MutatorReturn,
  type ReadonlyJSONValue,
  type ReadTransaction,
  type ReplicacheOptions,
  type WriteTransaction,
} from "replicache"
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

type MutatorDef<
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
  Output = any,
  S extends Schema<SInput, SOutput> = Schema<SInput, SOutput>,
> = (
  tx: ReadTransaction,
  args: Schema.InferOutput<S>,
) => Promise<Output> | Output

type QueryFnOut<
  SInput,
  SOutput,
  Output = any,
  S extends Schema<SInput, SOutput> = Schema<SInput, SOutput>,
> = (input: Schema.InferInput<S>) => Promise<Output> | Output

type QueryDef<
  Name extends string,
  SInput,
  SOutput,
  Output,
  S extends Schema<SInput, SOutput> = Schema<SInput, SOutput>,
> = {
  name: Name
  schema: S
  fn: QueryFnIn<SInput, SOutput, Output, S>
}

type ClientAPI<
  Q extends Record<string, QueryDef<string, any, any, any>>,
  M extends Record<string, MutatorDef<string, any, any, any>>,
> = {
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
      ? QueryFnOut<SInput, SOutput, Output, S>
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

export class ReplicacheClient<
  const Queries extends Record<string, QueryDef<string, any, any, any>> = {},
  const Mutators extends Record<string, MutatorDef<string, any, any, any>> = {},
> {
  #queries: Queries
  #mutators: Mutators
  #options: ReplicacheOptions<any>

  constructor(
    options: ReplicacheOptions<any>,
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
    Queries,
    Mutators & { [K in Name]: MutatorDef<Name, SInput, SOutput, Output> }
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

  query<const Name extends string, const SInput, const SOutput, const Output>(
    name: Name,
    schema: Schema<SInput, SOutput>,
    queryFn: QueryFnIn<SInput, SOutput, Output>,
  ) {
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

  build(): ClientAPI<Queries, Mutators> {
    // const query: ClientAPI<Queries, Mutators>["query"] = Object.fromEntries(
    //   Object.entries(this.#queries).map(([key, queryDef]) => {
    //     return [
    //       key,
    //       async (
    //         tx: ReadTransaction,
    //         input: Schema.InferInput<typeof queryDef.schema>,
    //       ) => queryDef.fn(tx, await validate(queryDef.schema, input)),
    //     ]
    //   }),
    // ) as never

    const query: ClientAPI<Queries, Mutators>["query"] = Object.fromEntries(
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
          return rep.query<ReturnType<typeof queryDef.fn>>(async (tx) => {
            return queryDef.fn(tx, await validate(queryDef.schema, input))
          })
        }

        return [key, queryFn]
      }),
    ) as never

    const mutators = Object.fromEntries(
      Object.entries(this.#mutators).map(([key, mutatorDef]) => {
        return [
          key,
          async (
            tx: WriteTransaction,
            input: Schema.InferInput<typeof mutatorDef.schema>,
          ) => mutatorDef.fn(tx, await validate(mutatorDef.schema, input)),
        ]
      }),
    )

    const rep: Replicache = new Replicache<typeof mutators>({
      ...this.#options,
      mutators,
    })

    const mutate: ClientAPI<Queries, Mutators>["mutate"] = Object.fromEntries(
      Object.entries(this.#mutators).map(([key, mutatorDef]) => {
        return [
          key,
          async (input: Schema.InferInput<typeof mutatorDef.schema>) => {
            const mutation = (rep.mutate as any)?.[key]
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
    } as never
  }
}

export type ReplicacheClientApi<
  Q extends Record<string, QueryDef<string, any, any, any>> = {},
  M extends Record<string, MutatorDef<string, any, any, any>> = {},
> = ClientAPI<Q, M>
