import { Navigate, RouteSectionProps } from "@solidjs/router"
import { wireStore } from "../lib/store"
import { createEffect, createSignal, onCleanup, ParentProps, Show } from "solid-js"
import { useConvex, useQuery } from "../lib/convex/provider"
import { api } from "../../convex/_generated/api"


export function ProtectedWrapper(props: RouteSectionProps) {
  let { auth } = useConvex()

  function Private(props: ParentProps) {
    let user = useQuery(api.functions.getCurrentUser, {})
    return (
      <Show when={user()} keyed>
        {user => (
          <wireStore.Provider namespace={user.id}>
            <LiveSync>
              {props.children}
            </LiveSync>
          </wireStore.Provider>
        )}
      </Show>
    )
  }

  return (
    <>
      <Show when={auth.state === "authenticated"}>
        <Private>
          {props.children}
        </Private>
      </Show>
      <Show when={auth.state === "unauthenticated"}>
        <Navigate href="/login" />
      </Show>
    </>
  )
}


function LiveSync(props: ParentProps) {
  let store = wireStore.use()
  let { convex } = useConvex()


  let unsubscribe: (() => void) | undefined = undefined

  function restartListener() {
    cleanup()
    let cursorRaw = store.sync.cursor()
    let cursor = cursorRaw ? parseInt(cursorRaw) : undefined

    unsubscribe = convex.onUpdate(api.functions.liveSync, { cursor }, async (update) => {
      console.log("live:sync: update received", update)
      if (update.records.length === 0) return
      await store.sync({
        records: update.records.map(record => ({
          ...record,
          data: {
            ...record.data,
            id: record.id,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
          }
        })),
        syncCursor: update.syncCursor,
      })
      cleanup()
      restartListener()
    }).unsubscribe
  }

  function cleanup() {
    try {
      unsubscribe?.()
      unsubscribe = undefined
    } catch (e) {
      console.error("live:sync: error cleaning up ", e)
    }
  }

  onCleanup(cleanup)

  restartListener()

  return props.children
}