import { createMemo, createSignal, For, Show } from "solid-js"
import { api } from "../../convex/_generated/api"
import { SyncStore } from "../lib/sync"
import { useQuery } from "../lib/convex/provider"
import { createAsync, useNavigate, useSearchParams } from "@solidjs/router"
import { convex } from "../lib/convex/client"
import { createPersistentSignal } from "../components/utils"


export type SelectableModel = { model: string, apiKey: string }

export function useModelSelector() {
  let navigate = useNavigate()
  let store = SyncStore.use()
  let models = useQuery(api.functions.getModels, {})
  let [searchParams, setSearchParams] = useSearchParams()
  let showSelectDialog = createMemo(() => searchParams.select === "true")

  let [selectedModelId, setSelectedModelId] = createPersistentSignal("selectedModel", searchParams.model)
  let modelsWithConfigs = createAsync(async () => {
    let currentModels = models() ?? []
    let [configs, privateConfigs] = await Promise.all([
      store.modelConfigs.all(),
      store.privateModelConfigs.all()
    ])
    let allConfigs = [...configs, ...privateConfigs]
    return currentModels.map(model => {
      let config = allConfigs.find(c => c.model === model.name)
      return {
        model: model.name,
        apiKey: config?.apiKey || "",
      }
    })
  })

  let { show: showSettings, Dialog: SettingsDialog } = useSettingsDialog()

  let selectedModel = createMemo(() => {
    let model = selectedModelId() as string | undefined
    if (!model) return
    return modelsWithConfigs()?.find(m => m.model === model)
  })

  function select(model: SelectableModel) {
    let config = modelsWithConfigs()?.find(m => m.model === model.model)
    if (config?.apiKey) {
      setSelectedModelId(model.model)
      navigate(-1)
    } else {
      showSettings(model)
    }
  }

  function startModelSelection() {
    setSearchParams({ ...searchParams, select: "true" })
  }

  function SelectDialog() {
    return (
      <>
        <dialog open class="flex justify-center items-center fixed top-0 left-0 w-full h-full bg-black/50">
          <div class="bg-white p-4 rounded-md">
            <h1>Select Model</h1>
            <ul class="space-y-2">
              <For each={modelsWithConfigs()}>
                {(model) => (
                  <li class="bg-gray-100 rounded px-2 py-1"
                    classList={{
                      "font-semibold": selectedModel()?.model === model.model
                    }}
                  >
                    <button onClick={() => select(model)}>{model.model}</button>
                  </li>
                )}
              </For>
            </ul>
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
      return model.model
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
      // TODO: CONTINUE: this is not working
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
              <h1>{model()?.model} Settings</h1>
              <input type="hidden" name="model" value={model()?.model} />
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