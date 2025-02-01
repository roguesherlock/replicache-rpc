import { type } from "arktype"
import { TEST_LICENSE_KEY } from "replicache"
import { describe, expect, test } from "vitest"
import { ReplicacheClient } from "./client"

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

    const queryResult = await client.query.listUser({ id: 1 })

    expect(result).toEqual({ id: 1, name: "Jean" })
    expect(queryResult).toEqual([{ id: 1, name: "Jean" }])
  })
})
