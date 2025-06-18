import { createEffect, createMemo, createSignal, For, Show, untrack } from "solid-js"
import { api } from "../../convex/_generated/api"
import { SyncStore } from "../lib/sync"
import { useQuery } from "../lib/convex/provider"
import { createAsync, useNavigate, useSearchParams } from "@solidjs/router"
import { createPersistentSignal } from "../components/utils"
import { useOpenRouter } from "../lib/openrouter"
import { Button } from "../components/buttons"
import { ChevronDownIcon, OpenRouterIcon } from "../components/icons"
import { useSearch } from "./search"

export type SelectableModel = { id: string, name: string, apiKey: string, provider: string }

const initialModelId = new URL(window.location.href).searchParams.get("model")

export const [selectedModelId, setSelectedModelId] = createPersistentSignal("selectedModel", initialModelId || "")

export function useModelSelector() {
  let navigate = useNavigate()
  let openRouter = useOpenRouter()
  let trialModel = useQuery(api.functions.getTrialModel, {})

  let allModels = createAsync(async () => {
    let models: SelectableModel[] = []
    let trial = trialModel()
    if (trial) {
      models.push({
        id: trial.id,
        name: trial.name,
        provider: trial.provider,
        apiKey: "trial"
      })
    }
    if (openRouter.key) {
      models = openRouter.models.map<SelectableModel>(model => ({
        id: model.id,
        name: model.name,
        provider: "openrouter",
        apiKey: openRouter.key || "",
      }))
    }
    return models
  })

  let selectedModel = createMemo<SelectableModel | undefined>(() => {
    let modelId = selectedModelId() as string | undefined
    if (!modelId) return
    let model = allModels()?.find(m => m.id === modelId)
    if (!model?.apiKey) return
    return model
  })

  createEffect(() => {
    let trial = trialModel()
    if (trial && !selectedModelId()) {
      untrack(() => {
        setSelectedModelId(trial.id)
      })
    }
  })

  function select(model: SelectableModel) {
    if (model.apiKey) {
      setSelectedModelId(model.id)
      navigate(-1)
    } else {
      alert("No API key configured for this model.")
    }
  }

  return { selectedModel, select }
}


export function useOpenRouterSetup() {
  let navigate = useNavigate()
  let [searchParams, setSearchParams] = useSearchParams()
  let open = createMemo(() => searchParams.select === "true")
  let dialogRef = undefined as undefined | HTMLDialogElement

  createEffect(() => {
    if (open()) {
      dialogRef?.showModal()
    } else {
      dialogRef?.close()
    }
  })

  function show() {
    setSearchParams({ ...searchParams, select: "true" })
  }

  function close() {
    navigate(-1)
  }

  function onDialogKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }



  function Setup() {
    let openRouter = useOpenRouter()

    return (
      <div class="flex  justify-center h-screen w-screen pt-32">
        <div class="max-w-sm w-full">
          <div class="flex gap-2 items-center mx-auto">
            <OpenRouterIcon class="size-8" />
            <span class="font-medium text-2xl">OpenRouter</span>
          </div>
          <section class="pt-6">
            <header class="sr-only">Connect OpenRouter</header>
            <p class="text-on-surface-light text-lg">Unlock hundreds of models through OpenRouter from multiple vendors like OpenAI, Anthropic, Google, DeepSeek and many more.</p>
            <Show when={openRouter.error}>
              <p class="text-red-600 py-4 bg-pink-100 px-6 py-4 rounded-xl mt-4">
                OpenRouter integration failed: {openRouter.error}
              </p>
            </Show>
            <div class="space-y-2 pt-6">
              <Button
                label="Connect OpenRouter"
                style="primary"
                large
                fullWidth
                onClick={openRouter.connect}
                icon={<OpenRouterIcon class="size-4" />}
              />
              <Button
                fullWidth
                large
                style="neutral"
                label="Cancel"
                onClick={close}
              />
            </div>
            <details class="text-on-surface-light pt-6 px-2">
              <summary class="mx-auto">How is my API Key used?</summary>
              <p class="block pt-4">
                Once you connect your OpenRouter account, your OpenRouter API Key will be stored in your browser only. When chatting with the models, your API Key will be sent with every request, and it will safely travel through our servers. Your API Key is never logged or stored anywhere in our servers.
                {" "}<a class="text-primary font-medium" href="https://github.com/pauloevpr/roquechat" target="_blank">Learn More.</a>
              </p>
            </details>
          </section>
        </div>
      </div>
    )
  }

  function Dialog() {
    return (
      <>
        <dialog
          ref={dialogRef}
          classList={{
            "hidden": !open(),
            "z-10 fixed top-0 left-0 min-w-screen min-h-screen bg-surface": open(),
          }}
          onKeyDown={onDialogKeyDown}>
          <Setup />
        </dialog>
      </>
    )
  }

  return { OpenRouterSetupDialog: Dialog, showOpenRouterSetup: show }
}




