import { type } from "arktype"
import {
  type ReadTransaction,
  TEST_LICENSE_KEY,
  type WriteTransaction,
} from "replicache"
import { describe, expect, test } from "vitest"
import { initClient, ReplicacheClient } from "./client"
import { ReplicacheServer } from "./server"
import type { ExtractServerMutations } from "./types"

function createReplicacheClient() {
  return new ReplicacheClient({
    name: "test replicache",
    licenseKey: TEST_LICENSE_KEY,
    pushURL: undefined,
    pullURL: undefined,
    kvStore: "mem",
  })
}

describe("ReplicacheClient", () => {
  test("successfully executes a valid mutation", async () => {
    const client = createReplicacheClient()
      .query("listUser", type({ id: "number" }), (tx, { id }) => {
        return tx
          .scan({ prefix: `/user/${id}` })
          .values()
          .toArray()
      })
      .mutation(
        "createUser",
        type({ id: "number", name: "string" }),
        async (tx, input) => {
          tx.set(`/user/${input.id}`, input)
          return input
        },
      )
      .build()

    const result = await client.mutate.createUser({ id: 1, name: "Jean" })

    const queryResult = await client.query.listUser.once({ id: 1 })

    expect(result).toEqual({ id: 1, name: "Jean" })
    expect(queryResult).toEqual([{ id: 1, name: "Jean" }])
  })

  test("throws error when mutation input validation fails", async () => {
    const client = createReplicacheClient()
      .mutation(
        "createUser",
        type({ id: "number", name: "string" }),
        async (tx, input) => {
          tx.set(`/user/${input.id}`, input)
          return input
        },
      )
      .build()

    await expect(
      // @ts-expect-error Testing runtime type validation
      client.mutate.createUser({ id: "invalid", name: "Jean" }),
    ).rejects.toThrow()
  })

  test("handles multiple mutations in sequence", async () => {
    const client = createReplicacheClient()
      .mutation(
        "createUser",
        type({ id: "number", name: "string" }),
        async (tx, input) => {
          tx.set(`/user/${input.id}`, input)
          return input
        },
      )
      .query("getAllUsers", type({}), (tx) => {
        return tx.scan({ prefix: "/user/" }).values().toArray()
      })
      .build()

    await client.mutate.createUser({ id: 1, name: "Jean" })
    await client.mutate.createUser({ id: 2, name: "Marie" })

    const users = await client.query.getAllUsers.once({})
    expect(users).toHaveLength(2)
    expect(users).toEqual([
      { id: 1, name: "Jean" },
      { id: 2, name: "Marie" },
    ])
  })

  test("updates existing data with mutation", async () => {
    const client = createReplicacheClient()
      .mutation(
        "createUser",
        type({ id: "number", name: "string" }),
        async (tx, input) => {
          tx.set(`/user/${input.id}`, input)
          return input
        },
      )
      .mutation(
        "updateUserName",
        type({ id: "number", name: "string" }),
        async (tx, input) => {
          tx.set(`/user/${input.id}`, input)
          return input
        },
      )
      .query("getUser", type({ id: "number" }), async (tx, { id }) => {
        const result = await tx.get(`/user/${id}`)
        return result ?? null
      })
      .build()

    await client.mutate.createUser({ id: 1, name: "Jean" })
    await client.mutate.updateUserName({ id: 1, name: "Jean-Pierre" })

    const user = await client.query.getUser.once({ id: 1 })
    expect(user).toEqual({ id: 1, name: "Jean-Pierre" })
  })

  test("handles deletion of data", async () => {
    const client = createReplicacheClient()
      .mutation(
        "createUser",
        type({ id: "number", name: "string" }),
        async (tx, input) => {
          tx.set(`/user/${input.id}`, input)
          return input
        },
      )
      .mutation("deleteUser", type({ id: "number" }), async (tx, { id }) => {
        tx.del(`/user/${id}`)
      })
      .query("getUser", type({ id: "number" }), async (tx, { id }) => {
        const result = await tx.get(`/user/${id}`)
        return result ?? null
      })
      .build()

    await client.mutate.createUser({ id: 1, name: "Jean" })
    await client.mutate.deleteUser({ id: 1 })

    const user = await client.query.getUser.once({ id: 1 })
    expect(user).toBeNull()
  })

  test("handles typed transactions correctly", async () => {
    const client = createReplicacheClient()
      .query(
        "listUser",
        type({ id: "number" }),
        async (tx: ReadTransaction, { id }: { id: number }) => {
          return tx
            .scan({ prefix: `/user/${id}` })
            .values()
            .toArray()
        },
      )
      .mutation(
        "createUser",
        type({ id: "number", name: "string" }),
        async (tx: WriteTransaction, input: { id: number; name: string }) => {
          await tx.set(`/user/${input.id}`, input)
          return input
        },
      )
      .build()

    const result = await client.mutate.createUser({ id: 1, name: "Jean" })
    expect(result).toEqual({ id: 1, name: "Jean" })
  })
  test("correctly requires server mutations to be implemented", () => {
    const serverClient = new ReplicacheServer().mutation(
      "createUser",
      type({ id: "number", name: "string" }),
      async (input) => {},
    )
    type ServerMutations = ExtractServerMutations<typeof serverClient>
    const client = initClient<ServerMutations>({
      name: "test replicache",
      licenseKey: TEST_LICENSE_KEY,
      pushURL: undefined,
      pullURL: undefined,
      kvStore: "mem",
    })
      .mutation(
        "createUser2",
        type({ id: "number", name: "string" }),
        async (input) => {},
      )
      .build()
  })
})
