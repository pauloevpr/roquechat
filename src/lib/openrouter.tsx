import { createContext, createEffect, createSignal, onMount, ParentProps, Show, useContext } from "solid-js";
import { createStore } from "solid-js/store";
import { createWireStore, localOnly } from "../solid-wire";


const StorageKeys = {
  verifier: "__openrouter:verifier",
  key: "__openrouter:key",
}

export type OpenRouterContextValue = {
  key: string | undefined
  error: string | undefined
  connect: () => void
  disconnect: () => void,
  models: OpenRouterModel[]
}

const OpenRouterContext = createContext<OpenRouterContextValue>()

export function useOpenRouter() {
  let context = useContext(OpenRouterContext)
  if (!context) {
    throw new Error("OpenRouterProvider not registered")
  }
  return context
}

export function OpenRouterProvider(props: ParentProps) {
  return (
    <ModelsStore.Provider>
      <OpenRouterProviderInternal>
        {props.children}
      </OpenRouterProviderInternal>
    </ModelsStore.Provider>
  )
}

function OpenRouterProviderInternal(props: ParentProps) {
  let [done, setDone] = createSignal(false)
  let [state, setState] = createStore<OpenRouterContextValue>({
    key: localStorage.getItem(StorageKeys.key) || undefined,
    error: undefined as string | undefined,
    connect: connect,
    disconnect: disconnect,
    models: [] as OpenRouterModel[],
  })
  let store = ModelsStore.use()

  createEffect(async () => {
    let models = await store.models.all()
    setState("models", models)
  })

  async function refreshModels() {
    try {
      let result = await fetch("https://openrouter.ai/api/v1/models")
      if (!result.ok) throw new Error(`Fetching models failed with status ${result.status} (${result.statusText})`)
      let data = await result.json() as { data: OpenRouterModel[] }
      for (let model of data.data) {
        await store.models.set(model.id, model)
      }
      console.log(`openrouter: ${data.data.length} models refreshed`)
    } catch (error) {
      console.error("openrouter: Error refreshing models: ", error)
    }
  }

  async function checkForCode() {
    let url = new URL(window.location.href)
    let code = url.searchParams.get("code")
    let isFlowInProgress = !!localStorage.getItem(StorageKeys.verifier)
    if (code && isFlowInProgress) {
      url.searchParams.delete("code")
      history.replaceState({}, "", url.toString())
      await getTokens(code)
    } else {
      setDone(true)
    }
  }

  async function getTokens(code: string) {
    try {
      console.log("openrouter: code received, getting key")
      setState({
        key: undefined,
        error: undefined,
      })
      let codeVerifier = localStorage.getItem(StorageKeys.verifier)
      localStorage.removeItem(StorageKeys.verifier)
      if (!codeVerifier) throw Error("No code verifier found to continue with the integration workflow")
      let response = await fetch('https://openrouter.ai/api/v1/auth/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          code_verifier: codeVerifier,
          code_challenge_method: "S256",
        }),
      })
      let { key } = await response.json();
      if (typeof key !== "string") throw Error(`Invalid key received from the server. Expected string, got ${typeof key}`)
      setState("key", key)
      localStorage.setItem(StorageKeys.key, key)
    } catch (error) {
      console.error("openrouter: Error getting key: ", error)
    } finally {
      setDone(true)
    }
  }


  function disconnect() {
    localStorage.removeItem(StorageKeys.key)
    localStorage.removeItem(StorageKeys.verifier)
    setState("key", undefined)
    setState("error", undefined)
  }


  onMount(() => {
    checkForCode()
    refreshModels()
  })

  return (
    <Show when={done()}>
      <OpenRouterContext.Provider value={state}>
        {props.children}
      </OpenRouterContext.Provider>
    </Show>
  )
}

async function connect() {
  const codeVerifier = createCodeVerifier();
  localStorage.setItem(StorageKeys.verifier, codeVerifier)
  const codeChallenge = await createSHA256CodeChallenge(codeVerifier);
  let redirect = new URL("https://openrouter.ai/auth")
  let callbackUrl = "http://localhost:3010"
  redirect.searchParams.set("callback_url", callbackUrl)
  redirect.searchParams.set("code_challenge", codeChallenge)
  redirect.searchParams.set("code_challenge_method", "S256")
  window.location.href = redirect.toString()
}

async function createSHA256CodeChallenge(input: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hash));
  const base64 = btoa(String.fromCharCode.apply(null, hashArray));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function createCodeVerifier(length = 128) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  const array = new Uint32Array(length);
  window.crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    result += charset[array[i] % charset.length];
  }
  return result;
}



export type OpenRouterModel = {
  id: string;
  name: string;
  created: number;
  description: string;
  architecture: {
    input_modalities: ("text" | "image")[];
    output_modalities: ("text")[];
    tokenizer: string;
  };
  top_provider: {
    is_moderated: boolean;
  };
  pricing: {
    prompt: string;
    completion: string;
    image: string;
    request: string;
    input_cache_read: string;
    input_cache_write: string;
    web_search: string;
    internal_reasoning: string;
  };
  context_length: number;
  hugging_face_id: string;
  per_request_limits: {
    [key: string]: string;
  };
  supported_parameters: string[];
}

const ModelsStore = createWireStore({
  name: "openrouter",
  definition: {
    models: {} as OpenRouterModel,
  },
  sync: localOnly(),
})