import { createEffect, createMemo, untrack } from "solid-js"
import { api } from "../../convex/_generated/api"
import { useQuery } from "../lib/convex/provider"
import { createAsync, useNavigate } from "@solidjs/router"
import { createPersistentSignal } from "../components/utils"
import { useOpenRouter } from "../lib/openrouter"

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



