/// <reference types="@vitest/browser/matchers" />
import { type } from "arktype"
import { TEST_LICENSE_KEY } from "replicache"
import { describe, expect, test } from "vitest"
import { render } from "vitest-browser-react"
import { ReplicacheClient } from "./client"
import { createReplicacheReact } from "./react"

describe("Replicache apis for react", () => {
  test("loads and displays greeting", async () => {
    const client = createReplicacheClient()
      .query("listUser", type({ id: "number" }), async (tx, { id }) => {
        const result = await tx
          .scan({ prefix: `/user/${id}` })
          .values()
          .toArray()
        return result as Array<{ id: number; name: string }>
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
    const { ReplicacheProvider, useQuery, useReplicache } =
      createReplicacheReact(client)

    function ReplicacheReact() {
      return (
        <ReplicacheProvider>
          <TestReplicache />
        </ReplicacheProvider>
      )
    }

    function TestReplicache() {
      const rep = useReplicache()

      const { loading, data } = useQuery(rep.query.listUser, { id: 1 })

      return (
        <div>
          <span>{data?.[0]?.name}</span>
          <button
            onClick={async () => {
              await rep.mutate.createUser({ id: 1, name: "Jean" })
            }}
          >
            Create User
          </button>
        </div>
      )
    }

    const screen = render(<ReplicacheReact />)
    await screen.getByRole("button", { name: "Create User" }).click()
    expect.poll(() =>
      expect.element(screen.getByText("Jean")).toBeInTheDocument(),
    )
  })
})

function createReplicacheClient() {
  return new ReplicacheClient({
    name: "test replicache",
    licenseKey: TEST_LICENSE_KEY,
    pushURL: undefined,
    pullURL: undefined,
    kvStore: "mem",
  })
}
