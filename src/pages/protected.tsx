import { Navigate, RouteSectionProps } from "@solidjs/router"
import { createEffect, ParentProps, Show } from "solid-js"
import { useConvex, useQuery } from "../lib/convex/provider"
import { api } from "../../convex/_generated/api"
import { LiveSync, SyncStore } from "../lib/sync"


export function ProtectedWrapper(props: RouteSectionProps) {
  let { auth } = useConvex()

  useSignOutCleanup()

  function Private(props: ParentProps) {
    let user = useQuery(api.functions.getCurrentUser, {})
    return (
      <Show when={user()} keyed>
        {user => (
          <SyncStore.Provider namespace={user.id}>
            <LiveSync>
              {props.children}
            </LiveSync>
          </SyncStore.Provider>
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

function useSignOutCleanup() {
  let { auth } = useConvex()

  createEffect(() => {
    if (auth.state === "authenticated") {
      cleanupSensibleInfo()
    }
  })

  function cleanupSensibleInfo() {
    // TODO: make sure we clear any model api key saved locally
    // TODO: clean up solid-wire store?
  }
}
