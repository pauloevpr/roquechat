import { Navigate, RouteSectionProps } from "@solidjs/router"
import { wireStore } from "../lib/store"
import { createEffect, createSignal, ParentProps, Show } from "solid-js"
import { useConvex, useQuery } from "../lib/convex/provider"
import { api } from "../../convex/_generated/api"


export function ProtectedWrapper(props: RouteSectionProps) {
  let { auth } = useConvex()

  function Private(props: ParentProps) {
    let user = useQuery(api.functions.getCurrentUser, {})
    createEffect(() => {
      console.log("user", user())
    })
    return (
      <Show when={user()} keyed>
        {user => (
          <wireStore.Provider namespace={user.id}>
            {props.children}
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

