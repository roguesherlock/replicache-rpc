import {
  createContext,
  use,
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import type {
  ReadonlyJSONValue,
  ReadTransaction,
  ReplicacheOptions,
} from "replicache"
import { type AnyReplicacheClientAPI } from "./client"
import type { MaybePromise } from "./types"
import type { Schema } from "./util"

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
function isAsyncFunction(fn: Function): boolean {
  return fn instanceof AsyncFunction
}

export type ReplicacheReactOptions = Omit<ReplicacheOptions<any>, "mutators">

/**
 * Creates React bindings for a Replicache client with type-safe hooks for querying and mutations.
 *
 * @example
 * ```typescript
 * // First create your Replicache client
 * const client = new ReplicacheClient({ name: "todo-app" })
 *   .mutation("createTodo", todoSchema, async (tx, todo) => {
 *     await tx.put(`todo/${todo.id}`, todo);
 *   })
 *   .query("getTodos", z.void(), async (tx) => {
 *     const todos = [];
 *     for await (const [_, todo] of tx.scan({ prefix: "todo/" })) {
 *       todos.push(todo);
 *     }
 *     return todos;
 *   })
 *   .build();
 *
 * // Create React bindings
 * const { ReplicacheProvider, useQuery, useReplicache } = createReplicacheReact(client);
 *
 * // Use in your React components
 * function TodoList() {
 *   // Subscribe to real-time query updates
 *   const { data: todos, loading } = useQuery(client.query.getTodos, undefined);
 *
 *   // Access the client directly
 *   const rep = useReplicache();
 *
 *   if (loading) return <div>Loading...</div>;
 *
 *   return (
 *     <ul>
 *       {todos.map(todo => (
 *         <li key={todo.id}>{todo.text}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 *
 * // Wrap your app with the provider
 * function App() {
 *   return (
 *     <ReplicacheProvider>
 *       <TodoList />
 *     </ReplicacheProvider>
 *   );
 * }
 * ```
 *
 * @param client - A built ReplicacheClient instance
 * @returns Object containing React components and hooks:
 *  - `ReplicacheProvider`: React context provider component
 *  - `useQuery`: Hook for subscribing to real-time query updates
 *  - `useReplicache`: Hook for accessing the Replicache client instance
 */
export function createReplicacheReact<C extends AnyReplicacheClientAPI>(
  client: C,
) {
  // const client = new ReplicacheClient(options)

  const ReplicacheContext = createContext<typeof client>(client)

  /**
   * React Context Provider for Replicache client.
   * Must wrap any components that use Replicache hooks.
   */
  const ReplicacheProvider = ({ children }: { children: ReactNode }) => {
    return (
      <ReplicacheContext.Provider value={client}>
        {children}
      </ReplicacheContext.Provider>
    )
  }

  /**
   * Hook to access the Replicache client instance.
   * Must be used within a ReplicacheProvider.
   *
   * @returns The Replicache client instance
   * @throws Error if used outside of ReplicacheProvider
   */
  function useReplicache() {
    const rep = use(ReplicacheContext)
    if (!rep) {
      throw new Error("useReplicache must be used with ReplicacheProvider")
    }
    return rep
  }

  type ClientQuery<
    SInput,
    SOutput,
    Output extends MaybePromise<ReadonlyJSONValue>,
    S extends Schema<SInput, SOutput> = Schema<SInput, SOutput>,
  > = (tx: ReadTransaction, input: Schema.InferInput<S>) => Output

  type ClientQueryDependencies<
    SInput,
    SOutput,
    S extends Schema<SInput, SOutput> = Schema<SInput, SOutput>,
  > = Schema.InferInput<S>

  /**
   * Hook to subscribe to real-time query updates.
   *
   * @param query - The query function to execute
   * @param dependencies - Query input parameters that trigger re-execution when changed
   * @returns Object containing:
   *  - `loading`: Boolean indicating if initial data is still loading
   *  - `data`: The current query result
   */
  function useQuery<
    SInput = any,
    SOutput = any,
    Output extends MaybePromise<ReadonlyJSONValue> = any,
  >(
    query: ClientQuery<SInput, SOutput, Output>,
    depedencies: ClientQueryDependencies<SInput, SOutput>,
  ) {
    const rep = useReplicache()
    const queryData = useRef<Awaited<Output>>(null)
    const [loading, setLoading] = useState(true)

    const subscribe = useCallback(
      (callback: (...args: any[]) => void) => {
        return rep.rep.subscribe<Awaited<Output>>(
          (tx) => {
            return Promise.resolve(query(tx, depedencies))
          },
          {
            onData(data) {
              queryData.current = data
              setLoading(false)
              callback()
            },
            onError(error) {
              console.error(error)
              setLoading(false)
            },
          },
        )
      },
      depedencies
        ? Array.isArray(depedencies)
          ? depedencies
          : typeof depedencies === "object"
            ? Object.values(depedencies)
            : [depedencies]
        : [],
    )

    const getSnapshot = useCallback(() => {
      return queryData.current
    }, [])

    const getServerSnapshot = useCallback(() => {
      return queryData.current
    }, [])

    const data = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

    return useMemo(() => {
      return {
        loading,
        data,
      }
    }, [loading, data])
  }

  return {
    ReplicacheProvider,
    useQuery,
    useReplicache,
  }
}
