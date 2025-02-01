import type { ReplicacheServer } from "./server"
export type MaybePromise<T> = T | Promise<T>

export type ServerMutations<T extends Record<string, any>> = T

export type ExtractServerMutations<T> =
  T extends ReplicacheServer<infer M> ? M : never
