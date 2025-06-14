import { Accessor, createEffect, createMemo, createResource, createSignal, For, Index, onCleanup, Show, untrack } from "solid-js"
import { api } from "../../convex/_generated/api"
import { Id } from "../../convex/_generated/dataModel"
import { wireStore, Message, ModelConfig, PrivateModelConfig } from "../lib/store"
import { createStore } from "solid-js/store"
import "highlight.js/styles/github.css";
import { useConvex, useQuery } from "../lib/convex/provider"
import { createAsync, useNavigate, useSearchParams } from "@solidjs/router"
import { createMarked } from "../components/marked"
import { convex } from "../lib/convex/client"
import { createPersistentSignal } from "../components/utils"

type SelectableModel = { model: string, apiKey: string }

export function ChatPage() {
  let { convex } = useConvex()
  let store = wireStore.use()
  let [searchParams, setSearchParams] = useSearchParams()
  let chatId = createMemo(() => searchParams.chatId as Id<"records"> | undefined)
  let streaming = createMemo(() => false)
  let [messages, setMessages] = createStore([] as Message[])
  let refs = {
    main: undefined as undefined | HTMLDivElement,
    input: undefined as undefined | HTMLInputElement
  }
  let [selectedModel, SelectModelButton] = useModelSelectDialog()

  createEffect((previousChat: Id<"records"> | undefined) => {
    let currentChat = chatId()
    let chatChanged = currentChat !== previousChat
    if (!currentChat) {
      untrack(() => {
        setMessages([])
      })
    } else {
      store.messages.all().then(updatedMessages => {
        updatedMessages = updatedMessages.filter(x => x.chatId === currentChat).sort((a, b) => a.createdAt - b.createdAt)
        untrack(() => {
          if (chatChanged) {
            setMessages(updatedMessages)
            scrollToBottom()
          } else {
            // we want to append only new messages to the list to minimize computation
            let replaceFrom = messages.length
            for (let i = replaceFrom; i < updatedMessages.length; i++) {
              setMessages(i, updatedMessages[i])
            }
          }
        })
      })
    }
    return chatId()
  })

  function scrollToBottom() {
    if (refs.main) {
      refs.main?.scrollTo({ top: refs.main.scrollHeight, behavior: "instant" })
    }
  }

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    let form = e.target as HTMLFormElement
    const formData = new FormData(form)
    const content = (formData.get('message') as string).trim()
    form.reset()
    refs.input?.focus()
    if (!content) return
    let model = selectedModel()
    if (!model) {
      alert("Please select a model")
      return
    }
    // add a message to the list right away for optimistic update
    let lastMessage = messages[messages.length - 1]
    let newMessageIndex = messages.length
    setMessages(prev => [...prev, {
      content: content,
      chatId: chatId() as Id<"records">,
      from: "user",
      id: "",
      createdAt: (lastMessage?.createdAt || 0) + 1, // to assure the message appears at the bottom
      updatedAt: (lastMessage?.createdAt || 0) + 1, // to assure the message appears at the bottom
    }])

    let result = await convex.mutation(api.functions.sendMessage, {
      message: content,
      chatId: chatId(),
      model: {
        name: model.model,
        apiKey: model.apiKey,
      }
    })

    // update the message with the actual one from the server
    setMessages(newMessageIndex, result.message)

    if (!chatId()) {
      setSearchParams({ ...searchParams, chatId: result.chatId }, { replace: true })
    }
  }

  return (
    <div class="grid grid-cols-[auto_1fr]">
      <ChatList />
      <main
        ref={refs.main}
        class="p-10 overflow-y-auto h-screen">
        <div class="space-y-4 py-6">
          <Index each={messages}>
            {(message) => (
              <MessageItem message={message()} />
            )}
          </Index >
        </div >
        <form onSubmit={onSubmit}>
          <input type="text" class="border-2 border-gray-300 rounded-md p-2"
            name="message"
            classList={{ "bg-gray-200": streaming() }}
            required
            ref={refs.input} />
          <Show when={!streaming()}>
            <button
              type="submit"
              disabled={streaming()}
            >Send</button>
          </Show>
        </form>
        <SelectModelButton />
      </main >
    </div>
  )
}


function ChatList() {
  let { auth } = useConvex()
  let [searchParams] = useSearchParams()
  let store = wireStore.use()
  let chatId = createMemo(() => searchParams.chatId as Id<"records"> | undefined)

  let chats = createAsync(async () => {
    let chats = await store.chats.all()
    chats.sort((a, b) => b.updatedAt - a.updatedAt)
    return chats
  })

  function signOut() {
    auth.signOut()
  }

  return (
    <aside class="overflow-y-auto h-screen p-6 border">
      <ul class="space-y-2">
        <li>
          <a href="/">New Chat</a>
        </li>
        <For each={chats()}>
          {(chat) => (
            <li>
              <a
                classList={{
                  "font-semibold": chatId() === chat.id
                }}
                class="whitespace-nowrap"
                href={`/?chatId=${chat.id}`}>{chat.title ?? "New Chat"}</a>
            </li>
          )}
        </For>
      </ul>

      <button
        class="bg-gray-100 p-2 rounded-md mt-4"
        onClick={signOut}
      >
        Sign Out
      </button>
    </aside>
  )
}


function MessageItem(props: { message: Message }) {
  let marked = createMarked()
  let { convex } = useConvex()
  let [dynamicContent, setDynamicContent] = createSignal<string[] | undefined>(undefined)
  let content = createMemo(() => {
    return dynamicContent() || [props.message.content]
  })

  let [html] = createResource(content, (content) => {
    return marked.parse(content.join(""))
  })

  let unsubscribe: Function | undefined = undefined

  createEffect(() => {
    if (unsubscribe) return
    if (props.message.streaming && props.message.streamId) {
      unsubscribe = convex.onUpdate(
        api.functions.getStream,
        { id: props.message.streamId },
        stream => {
          let newContent = stream?.content || []
          setDynamicContent(newContent)
          if (stream?.finished) {
            unsubscribe?.()
          }
        }
      )
    }
  })

  onCleanup(() => {
    try {
      unsubscribe?.()
    } catch (e) {
      // sometimes this fails and we dont know why
    }
  })

  return (
    <article class=" border-2 border-gray-300 rounded-md p-2">
      <div class="prose" innerHTML={html()} />
    </article>
  )
}


function useModelSelectDialog() {
  let navigate = useNavigate()
  let store = wireStore.use()
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
  let store = wireStore.use()
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