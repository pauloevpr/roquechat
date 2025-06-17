import { createEffect, createMemo, createSignal, For, Show } from "solid-js"
import { api } from "../../convex/_generated/api"
import { SyncStore } from "../lib/sync"
import { useQuery } from "../lib/convex/provider"
import { createAsync, useNavigate, useSearchParams } from "@solidjs/router"
import { convex } from "../lib/convex/client"
import { createPersistentSignal } from "../components/utils"
import { useOpenRouter } from "../lib/openrouter"



export type SelectableModel = { id: string, name: string, apiKey: string, provider: string }

export function useModelSelector() {
  let navigate = useNavigate()
  let store = SyncStore.use()
  let baseModels = useQuery(api.functions.getModels, {})
  createEffect(() => {
    console.log("standardModels", baseModels())
  })
  let [searchParams, setSearchParams] = useSearchParams()
  let showSelectDialog = createMemo(() => searchParams.select === "true")
  let openRouter = useOpenRouter()

  let [selectedModelId, setSelectedModelId] = createPersistentSignal("selectedModel", searchParams.model)
  let allModels = createAsync(async () => {
    let models = (baseModels() ?? []).map<SelectableModel>(model => ({
      ...model,
      apiKey: ""
    }))
    if (openRouter.key) {
      let openRouterModels = openRouter.models.map<SelectableModel>(model => ({
        id: model.id,
        name: model.name,
        provider: "openrouter",
        apiKey: openRouter.key || "",
      }))
      models.push(...openRouterModels)
    }
    let [configs, privateConfigs] = await Promise.all([
      store.modelConfigs.all(),
      store.privateModelConfigs.all()
    ])
    let allConfigs = [...configs, ...privateConfigs]
    return models.map(model => {
      let config = allConfigs.find(c => c.model === model.name)
      if (config && !model.apiKey) {
        model.apiKey = config.apiKey
      }
      return model
    })
  })
  let groupedModels = createMemo(() => {
    let groups = new Map<string, SelectableModel[]>()
    for (let model of allModels() ?? []) {
      let group = groups.get(model.provider) ?? []
      group.push(model)
      groups.set(model.provider, group)
    }
    return Array.from(
      groups.entries()).map(([provider, models]) => ({ provider, models })
      )
  })

  let { show: showSettings, Dialog: SettingsDialog } = useSettingsDialog()

  let selectedModel = createMemo<SelectableModel | undefined>(() => {
    let modelId = selectedModelId() as string | undefined
    if (!modelId) return
    return allModels()?.find(m => m.name === modelId)
  })

  function select(model: SelectableModel) {
    if (model.apiKey) {
      setSelectedModelId(model.name)
      navigate(-1)
    } else {
      showSettings(model)
    }
  }

  function startModelSelection() {
    setSearchParams({ ...searchParams, select: "true" })
  }

  function disconnect() {
    let confirmed = window.confirm("Are you sure you want to disconnect from OpenRouter?")
    if (!confirmed) return
    openRouter.disconnect()
  }

  function SelectDialog() {
    return (
      <>
        <dialog open class="flex justify-center items-center fixed top-0 left-0 w-full h-full bg-black/50">
          <div class="bg-white p-4 rounded-md max-h-[80vh] overflow-y-auto">
            <h1>Select Model</h1>
            <ul class="space-y-2">
              <For each={groupedModels()}>
                {(group) => (
                  <>
                    <li>
                      <span class="font-semibold block">{group.provider}</span>
                    </li>
                    <For each={group.models}>
                      {(model) => (
                        <li class="bg-gray-100 rounded px-2 py-1"
                          classList={{
                            "font-semibold": selectedModel()?.name === model.name
                          }}
                        >
                          <button onClick={() => select(model)}>{model.name}</button>
                        </li>
                      )}
                    </For>
                  </>
                )}
              </For>
            </ul>
            <Show when={openRouter.error}>
              <p class="text-red-500">
                OpenRouter integration failed: {openRouter.error}
              </p>
            </Show>
            <Show when={openRouter.key}>
              <p class="text-blue-700 font-medium">You are connected to OpenRouter</p>
              <button class="" onClick={disconnect}>Disconnect</button>
            </Show>
            <Show when={!openRouter.key}>
              <button
                class="bg-blue-500 text-white px-4 py-2 rounded-md text-lg"
                onClick={openRouter.connect}>
                Connect OpenRouter
              </button>
            </Show>
            <button onClick={() => navigate(-1)}>Cancel</button>
          </div >
        </dialog>
      </>
    )
  }

  function SelectButton() {
    let label = createMemo(() => {
      let model = selectedModel()
      if (!model) return "Select Model"
      return model.name
    })
    return (
      <>
        <button onClick={startModelSelection}>
          {label()}
        </button>
        <Show when={showSelectDialog()}>
          <SelectDialog />
          <SettingsDialog />
        </Show>
      </>
    )
  }

  return [selectedModel, SelectButton] as [typeof selectedModel, typeof SelectButton]
}


function useSettingsDialog() {
  let store = SyncStore.use()
  let navigate = useNavigate()
  let [searchParams, setSearchParams] = useSearchParams()
  let [model, setModel] = createSignal<SelectableModel | undefined>()
  let showSettingsDialog = createMemo(() => searchParams.settings === "true")

  function show(model: SelectableModel) {
    setModel(model)
    setSearchParams({ ...searchParams, settings: "true" })
  }

  function Dialog() {

    async function onSubmit(e: SubmitEvent) {
      e.preventDefault()
      let form = e.target as HTMLFormElement
      let formData = new FormData(form)
      let apiKey = formData.get("apiKey") as string
      let storage = formData.get("storage") as string
      let model = formData.get("model") as string
      if (storage === "local") {
        await store.privateModelConfigs.set(model, {
          model,
          apiKey,
          id: model,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      } else if (storage === "server") {
        // TODO: add loading indicator?
        await convex.mutation(api.functions.saveModelConfig, {
          model,
          apiKey
        })
      }
      setModel(undefined)
      navigate(-1)
    }

    return (
      <Show when={showSettingsDialog()}>
        <dialog open class="flex justify-center items-center fixed top-0 left-0 w-full h-full bg-black/50">
          <div class="bg-white p-4 rounded-md">
            <form onSubmit={onSubmit}>
              <h1>{model()?.name} Settings</h1>
              <input type="hidden" name="model" value={model()?.name} />
              <input
                name="apiKey"
                placeholder="Enter API Key"
                required
                maxLength={512}
              />
              <div class="mt-4 space-y-2">
                <div>
                  <label class="flex items-center gap-2">
                    <input type="radio" name="storage" value="local" checked />
                    <span>Save Local</span>
                  </label>
                </div>
                <div>
                  <label class="flex items-center gap-2">
                    <input type="radio" name="storage" value="server" />
                    <span>Save on Server</span>
                  </label>
                </div>
              </div>
              <button class="bg-blue-500 text-white px-4 py-2 rounded-md"
                type="submit">Save</button>
              <button onClick={() => navigate(-1)} type="button">Cancel</button>
            </form>
          </div>
        </dialog>
      </Show>
    )
  }
  return { Dialog, show }
}