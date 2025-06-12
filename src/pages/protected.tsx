import { Navigate, RouteSectionProps } from "@solidjs/router"
import { wireStore } from "../lib/store"
import { Show } from "solid-js"
import { useConvex } from "../lib/convex/provider"


export function ProtectedWrapper(props: RouteSectionProps) {
  let { auth } = useConvex()

  // TODO: namespace should be the user id
  return (
    <>
      <Show when={auth.state === "authenticated"}>
        <wireStore.Provider namespace="some-user">
          {props.children}
        </wireStore.Provider>
      </Show>
      <Show when={auth.state === "unauthenticated"}>
        <Navigate href="/login" />
      </Show>
    </>
  )
}

