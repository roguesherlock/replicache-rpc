# Replicache RPC

A type-safe RPC layer for Replicache that provides end-to-end type safety between your server and client.

## Installation

```bash
bun install replicache-rpc
```

## Basic Example

Here's a complete example showing how to use replicache-rpc:


### Define your server-side mutations

```typescript
// server.ts
import { ReplicacheServer } from 'replicache-rpc/server'
import { type } from 'arktype' // or use zod/valibot

// 1. Define your server
export const server = new ReplicacheServer()
  .mutation(
    "createUser",
    type({ id: "number", name: "string" }),
    async (input) => {
      // Server-side mutation logic
      await db.users.create(input)
    }
  )

// 2. Export the server type for client-side type safety
export type ServerMutations = ExtractServerMutations<typeof server>
```

### Create the client

```typescript
// client.ts
import { ReplicacheClient } from 'replicache-rpc/client'
import type { ServerMutations } from './server'
import { type } from 'arktype' // or use zod/valibot

// 3. Create the client
export const client = new ReplicacheClient<ServerMutations>({
  name: "my-app",
  licenseKey: REPLICACHE_LICENSE_KEY,
  pushURL: "/api/replicache-push",
  pullURL: "/api/replicache-pull",
})
  .mutation(
    "createUser",
    type({ id: "number", name: "string" }),
    async (tx, input) => {
      // Client-side mutation logic
      await tx.set(`user/${input.id}`, input)
      return input
    }
  )
  .query(
    "listUsers",
    type({}),
    async (tx) => {
      // Query logic
      return await tx.scan({ prefix: "user/" }).values().toArray()
    }
  )
  .build()
```

### React (Optional)

#### Create React hooks (Optional)

```typescript
// replicache.ts
import { createReplicacheReact } from 'replicache-rpc/react'
import { client } from './client'

// 4. Optional: Create React hooks
export const { ReplicacheProvider, useQuery, useReplicache } = createReplicacheReact(client)
```


#### Use in React components

```typescript
// user-list.tsx
import { useQuery, useReplicache } from './replicache'

// 5. Use in React components
function UserList() {
  const { data: users, loading } = useQuery(client.query.listUsers, {})
  const rep = useReplicache()

  if (loading) return <div>Loading...</div>

  return (
    <div>
      <button onClick={() => rep.mutate.createUser({ id: 1, name: "John" })}>
        Add User
      </button>
      {users.map(user => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  )
}
```

#### Wrap your app with the provider

```typescript
// app.tsx

import { ReplicacheProvider } from './replicache'
import { UserList } from './user-list'

// Wrap your app with the provider
function App() {
  return (
    <ReplicacheProvider>
      <UserList />
    </ReplicacheProvider>
  )
}
```
