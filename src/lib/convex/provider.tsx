import { ConvexClient } from "convex/browser";
import { FunctionReference } from "convex/server";
import { Accessor, createContext, createSignal, onCleanup, onMount, ParentProps, Setter, useContext } from "solid-js";
import { AuthTokenFetcher, ConvexAuthState, ConvexContextValue, SignInParams, SignInResult } from "./types";
import { createStore } from "solid-js/store";

// TODO: Improve error handling to show feedback to the user when something goes wrong
//
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
    try {
      tokenStorage.save(undefined)
      await props.client.action("auth:signOut" as any, {});
      // we do this to force a complete state reset
      // otherwise convex for some reason wont figure out we have signed out
      window.location.href = "/"
    } catch (error) {
      // From convex-auth/src/react/client.tsx:
      // "Ignore any errors, they are usually caused by being
      // already signed out, which is ok."
    } finally {
      // setStore("auth", "state", "unauthenticated")
      console.log("Sign out complete")
    }
  }

  useAutoSignIn(() => props.client, authState => {
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

export function useQuery<Query extends FunctionReference<"query">>(
  query: Query,
  args: Query["_args"]
) {
  let { convex } = useConvex()
  let fullArgs = args ?? {};
  let [data, setData] = createSignal<Query["_returnType"] | undefined>()

  const unsubber = convex!.onUpdate(query, fullArgs, (data) => {
    setData(data)
  });

  onCleanup(() => {
    unsubber?.()
  })

  return data
}

function useAutoSignIn(
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
      tokenStorage.save(result.tokens)

      convex().setAuth(tokenFetcher, (isAuthenticated) => {
        setAuthState(
          isAuthenticated === true
            ? "authenticated"
            : "unauthenticated"
        )
      })
    } catch (e) {
      console.error(`Error signing in with code: ${e}`)
      tokenStorage.save(undefined)
      setAuthState("unauthenticated")
    }
  }

  function signInWithToken() {
    convex().setAuth(tokenFetcher, (isAuthenticated) => {
      setAuthState(
        isAuthenticated === true
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
    } else if (tokenStorage.read().accessToken) {
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
      let refreshToken = tokenStorage.read().refreshToken
      if (refreshToken) {
        try {
          let signInParams = { refreshToken }
          let result: SignInResult = await convex().action("auth:signIn" as any, signInParams)
          tokenStorage.save(result.tokens)
        } catch (e) {
          console.error("error refreshing token", e)
        }
      }
    }
    let accessToken = tokenStorage.read().accessToken
    return accessToken
  }
  return fetcher
}

let tokenStorage = {
  save: (tokens: SignInResult["tokens"] | undefined | null) => {
    if (tokens) {
      localStorage.setItem(StorageKeys.accessToken, tokens.token!)
      localStorage.setItem(StorageKeys.refreshToken, tokens.refreshToken!)
    } else {
      localStorage.removeItem(StorageKeys.accessToken)
      localStorage.removeItem(StorageKeys.refreshToken)
    }
  },
  read: () => {
    return {
      accessToken: localStorage.getItem(StorageKeys.accessToken),
      refreshToken: localStorage.getItem(StorageKeys.refreshToken)
    }
  }
}