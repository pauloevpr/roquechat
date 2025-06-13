import { Navigate, RouteSectionProps } from "@solidjs/router"
import { wireStore } from "../lib/store"
import { ParentProps, Show } from "solid-js"
import { useConvex, useQuery } from "../lib/convex/provider"
import { api } from "../../convex/_generated/api"
import { LiveSync } from "../lib/sync"


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


