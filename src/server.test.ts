import { type } from "arktype"
import * as v from "valibot"
import { describe, expect, test } from "vitest"
import { z } from "zod"
import { ReplicacheServer } from "./server"

describe("ReplicacheServer", () => {
  test("successfully executes a valid mutation", async () => {
    const todoSchema = type({
      name: "string",
    })

    let capturedInput: any = null
    const server = new ReplicacheServer().mutation(
      "createTodo",
      todoSchema,
      (input) => {
        capturedInput = input
      },
    )

    await server.mutate("createTodo", {
      name: "Buy groceries",
    })

    expect(capturedInput).toEqual({ name: "Buy groceries" })
  })

  test("successfully executes a valid mutation with zod schema", async () => {
    const todoSchema = z.object({
      name: z.string(),
    })

    let capturedInput: any = null
    const server = new ReplicacheServer().mutation(
      "createTodo",
      todoSchema,
      (input) => {
        capturedInput = input
      },
    )

    await server.mutate("createTodo", {
      name: "Buy groceries",
    })

    expect(capturedInput).toEqual({ name: "Buy groceries" })
  })

  test("successfully executes a valid mutation with valibot schema", async () => {
    const todoSchema = v.object({
      name: v.string(),
    })

    let capturedInput: any = null
    const server = new ReplicacheServer().mutation(
      "createTodo",
      todoSchema,
      (input) => {
        capturedInput = input
      },
    )

    await server.mutate("createTodo", {
      name: "Buy groceries",
    })

    expect(capturedInput).toEqual({ name: "Buy groceries" })
  })

  test("throws error for non-existent mutation", async () => {
    const server = new ReplicacheServer()

    await expect(
      // @ts-expect-error - Testing runtime behavior with invalid mutation
      server.mutate("nonExistentMutation", {}),
    ).rejects.toThrow("Unknown mutation: nonExistentMutation")
  })

  test("validates input against schema", async () => {
    const todoSchema = type({
      name: "string",
      priority: "number",
    })

    const server = new ReplicacheServer().mutation(
      "createTodo",
      todoSchema,
      () => {},
    )

    await expect(
      server.mutate("createTodo", {
        name: "Buy groceries",
        priority: "high", // Should be a number
      }),
    ).rejects.toThrow() // Schema validation should fail
  })

  test("supports chaining multiple mutations", async () => {
    const todoSchema = type({
      name: "string",
    })

    const userSchema = type({
      id: "string",
      email: "string",
    })

    let lastCalledMutation = ""

    const server = new ReplicacheServer()
      .mutation("createTodo", todoSchema, (input) => {
        lastCalledMutation = "createTodo"
      })
      .mutation("createUser", userSchema, (input) => {
        lastCalledMutation = "createUser"
      })

    await server.mutate("createTodo", { name: "Task 1" })
    expect(lastCalledMutation).toBe("createTodo")

    await server.mutate("createUser", { id: "1", email: "test@example.com" })
    expect(lastCalledMutation).toBe("createUser")
  })

  test("supports async mutation handlers", async () => {
    const schema = type({
      id: "string",
    })

    let id = null
    const server = new ReplicacheServer().mutation(
      "asyncMutation",
      schema,
      async (input) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        id = input.id
        return
      },
    )

    await expect(
      server.mutate("asyncMutation", { id: "123" }),
    ).resolves.toBeUndefined()
    expect(id).toBe("123")
  })
})
