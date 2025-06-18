import { Navigate, RouteSectionProps } from "@solidjs/router"
import { createContext, createEffect, ParentProps, Show, useContext } from "solid-js"
import { useConvex, useQuery } from "../lib/convex/provider"
import { api } from "../../convex/_generated/api"
import { LiveSync, SyncStore } from "../lib/sync"
import { OpenRouterProvider } from "../lib/openrouter"

const CurrentUserContext = createContext<{
  user: {
    id: string
    name: string
    avatar: string
  }
}
>()

export function useCurrentUser() {
  let currentUser = useContext(CurrentUserContext)
  if (!currentUser) throw new Error("CurrentUserContext not found")
  return currentUser
}

export function ProtectedWrapper(props: RouteSectionProps) {
  let { auth } = useConvex()

  useSignOutCleanup()

  function Private(props: ParentProps) {
    let user = useQuery(api.functions.getCurrentUser, {})
    return (
      <Show when={user()} keyed>
        {user => (
          <CurrentUserContext.Provider value={{ user }}>
            <SyncStore.Provider namespace={user.id}>
              <LiveSync>
                {props.children}
              </LiveSync>
            </SyncStore.Provider>
          </CurrentUserContext.Provider>
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
