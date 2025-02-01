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
export function createReplicacheReact<C extends AnyReplicacheClientAPI>(
  client: C,
) {
  // const client = new ReplicacheClient(options)

  const ReplicacheContext = createContext<typeof client>(client)

  const ReplicacheProvider = ({ children }: { children: ReactNode }) => {
    return (
      <ReplicacheContext.Provider value={client}>
        {children}
      </ReplicacheContext.Provider>
    )
  }

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
