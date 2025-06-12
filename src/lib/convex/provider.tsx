import { ConvexClient } from "convex/browser";
import { FunctionReference } from "convex/server";
import { Accessor, Context, createContext, createEffect, createSignal, onCleanup, onMount, ParentProps, Setter, useContext } from "solid-js";
import { AuthTokenFetcher, ConvexAuthState, ConvexContextValue, SignInParams, SignInResult } from "./types";
import { createStore } from "solid-js/store";

const StorageKeys = {
  verifier: "__solid-convex-auth:verifier",
  accessToken: "__solid-convex-auth:accessToken",
  refreshToken: "__solid-convex-auth:refreshToken",
}

const ConvexContext = createContext<ConvexContextValue>()

export const ConvexProvider = (props: ParentProps<{ client: ConvexClient }>) => {

  let [store, setStore] = createStore<ConvexContextValue>({
    convex: props.client,
    auth: {
      state: "loading",
      signIn,
      signOut,
    }
  })

  async function signIn(provider: string, params?: SignInParams) {
    localStorage.removeItem(StorageKeys.verifier)
    let result: SignInResult = await props.client.action("auth:signIn" as any, { provider, params })
    if (result.redirect) {
      localStorage.setItem(StorageKeys.verifier, result.verifier!)
      const url = new URL(result.redirect);
      window.location.href = url.toString()
    }
  }

  async function signOut() {
    // TODO: implement sign out
  }

  useAutoSignInFromCode(() => props.client, authState => {
    setStore("auth", "state", authState)
  })

  return (
    <ConvexContext.Provider value={store}>
      {props.children}
    </ConvexContext.Provider>
  )
}

export function useConvex() {
  let value = useContext(ConvexContext)
  if (!value) { throw new Error(`Context ${name} not registered`) }
  return value
}

export function useQuery<T>(
  query: FunctionReference<"query">,
  args?: {}
) {
  let { convex } = useConvex()
  if (!convex) {
    throw new Error("Convex client not registered")
  }
  let fullArgs = args ?? {};
  let [data, setData] = createSignal<T | undefined>()

  const unsubber = convex!.onUpdate(query, fullArgs, (data) => {
    setData(data)
  });

  onCleanup(() => {
    unsubber?.()
  })

  return [data, setData]
}

function useAutoSignInFromCode(
  convex: Accessor<ConvexClient>,
  setAuthState: Setter<ConvexAuthState>,
) {
  let tokenFetcher = useAuthTokenFetcher(convex)

  async function signInWithCode(signInCode: string) {
    const url = new URL(window.location.href)
    url.searchParams.delete("code")
    history.replaceState({}, "", url.toString())

    let verifier = localStorage.getItem(StorageKeys.verifier)
    localStorage.removeItem(StorageKeys.verifier)
    let signInParams = { params: { code: signInCode }, verifier }

    try {
      let result = await convex().action("auth:signIn" as any, signInParams)
      if (result.tokens) {
        localStorage.setItem(StorageKeys.accessToken, result.tokens.token!)
        localStorage.setItem(StorageKeys.refreshToken, result.tokens.refreshToken!)
      } else {
        localStorage.removeItem(StorageKeys.accessToken)
        localStorage.removeItem(StorageKeys.refreshToken)
      }

      convex().setAuth(tokenFetcher, (authUpdated) => {
        setAuthState(
          authUpdated === true
            ? "authenticated"
            : "unauthenticated"
        )
      })
    } catch (e) {
      console.error(`Error signing in with code: ${e}`)
      localStorage.removeItem(StorageKeys.accessToken)
      localStorage.removeItem(StorageKeys.refreshToken)
      setAuthState("unauthenticated")
    }
  }

  function signInWithToken() {
    convex().setAuth(tokenFetcher, (authUpdated) => {
      setAuthState(
        authUpdated === true
          ? "authenticated"
          : "unauthenticated"
      )
    })
  }



  onMount(async () => {
    const signInCode =
      typeof window?.location?.search !== "undefined"
        ? new URLSearchParams(window.location.search).get("code")
        : null;

    if (signInCode) {
      await signInWithCode(signInCode)
    } else if (localStorage.getItem(StorageKeys.accessToken)) {
      signInWithToken()
    } else {
      setAuthState("unauthenticated")
    }

    // TODO: CONTINUE: check if the token is stored ant try sign in
  })
}

const useAuthTokenFetcher = (
  convex: Accessor<ConvexClient>,
) => {
  const fetcher: AuthTokenFetcher = async ({ forceRefreshToken }) => {
    if (forceRefreshToken) {
      let refreshToken = localStorage.getItem(StorageKeys.refreshToken)
      if (refreshToken) {

        try {
          let signInParams = { refreshToken }
          let result = await convex().action("auth:signIn" as any, signInParams)
          if (result.tokens) {
            localStorage.setItem(StorageKeys.accessToken, result.tokens.token!)
            localStorage.setItem(StorageKeys.refreshToken, result.tokens.refreshToken!)
          } else {
            localStorage.removeItem(StorageKeys.accessToken)
            localStorage.removeItem(StorageKeys.refreshToken)
          }
        } catch (e) {
          console.error("error refreshing token", e)
        }

        // TODO: implement refresh the access token
      }
    }
    let accessToken = localStorage.getItem(StorageKeys.accessToken)
    return accessToken
  }
  return fetcher
}