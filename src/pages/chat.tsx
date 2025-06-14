import "highlight.js/styles/github.css";
import { createEffect, createMemo, createResource, createSignal, For, Index, onCleanup, Show, untrack } from "solid-js"
import { api } from "../../convex/_generated/api"
import { Id } from "../../convex/_generated/dataModel"
import { wireStore, Message } from "../lib/store"
import { createStore } from "solid-js/store"
import { useConvex } from "../lib/convex/provider"
import { createAsync, useSearchParams } from "@solidjs/router"
import { createMarked } from "../components/marked"
import { SelectableModel, useModelSelector } from "./models"

export function ChatPage() {
  let { convex } = useConvex()
  let store = wireStore.use()
  let [searchParams, setSearchParams] = useSearchParams()
  let chatId = createMemo(() => searchParams.chatId as Id<"records"> | undefined)
  let streaming = createMemo(() => false)
  let [messages, setMessages] = createStore([] as Message[])
  let refs = {
    main: undefined as undefined | HTMLDivElement,
    input: undefined as undefined | HTMLTextAreaElement
  }
  let [selectedModel, SelectModelButton] = useModelSelector()

  createEffect((previousChat: Id<"records"> | undefined) => {
    let allMessages = store.messages.all()
    let currentChat = chatId()
    let chatChanged = currentChat !== previousChat
    untrack(() => {
      if (!currentChat) {
        setMessages([])
      } else {
        allMessages.then(matchingMessages => {
          matchingMessages = matchingMessages.filter(x => x.chatId === currentChat).sort((a, b) => a.createdAt - b.createdAt)
          setMessages(matchingMessages)
          if (chatChanged) {
            scrollToBottom()
          }
        })
      }
    })
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

  function onMessageEdited(messageId: string) {
    let index = messages.findIndex(message => message.id === messageId)
    if (index === -1) return
    setMessages(list => [...list].slice(0, index + 1))
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
              <MessageItem
                message={message()}
                model={selectedModel()}
                onEdited={onMessageEdited}
              />
            )}
          </Index >
        </div >
        <form onSubmit={onSubmit}>
          <textarea
            class="border-2 border-gray-300 rounded-md p-2"
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


function MessageItem(props: {
  message: Message,
  model: SelectableModel | undefined,
  onEdited: (messageId: string) => void,
}) {
  let marked = createMarked()
  let { convex } = useConvex()
  let [content, setContent] = createSignal("")

  createEffect(() => {
    setContent(props.message.content)
  })

  // let [dynamicContent, setDynamicContent] = createSignal<string[] | undefined>(undefined)
  // let content = createMemo(() => {
  //   return dynamicContent() || [props.message.content]
  // })
  let canEdit = createMemo(() => props.message.from === "user")
  let [editing, setEditing] = createSignal(false)

  let [html] = createResource(content, (content) => {
    return marked.parse(content)
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
          setContent(newContent.join(""))
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

  function onEditSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!props.model) {
      alert("Please select a model")
      return
    }
    let form = e.target as HTMLFormElement
    let content = form.querySelector("textarea")?.value || ""
    if (!content) return
    // we intentionally dont want to await here so the UI can update right away
    convex.mutation(api.functions.editMessage, {
      messageId: props.message.id as Id<"records">,
      content: content,
      model: {
        name: props.model.model,
        apiKey: props.model.apiKey,
      },
    })
    setContent(content)
    setEditing(false)
    props.onEdited(props.message.id)
  }

  return (
    <div>
      <Show when={!editing()}>
        <article class=" border-2 border-gray-300 rounded-md p-2">
          <div class="prose" innerHTML={html()} />
        </article>
        <Show when={canEdit()}>
          <button class="border" onClick={() => setEditing(true)}>Edit</button>
        </Show>
      </Show>
      <Show when={editing()}>
        <form action="" onSubmit={onEditSubmit}>
          <textarea
            name="content"
            required
            class="border-2 border-gray-300 rounded-md p-2 w-full"
            value={content()}
          />
          <button class="bg-green-500"
            type="submit">Save</button>
          <button class="border" onClick={() => setEditing(false)}
            type="button"
          >Cancel</button>
        </form>
      </Show>
    </div>
  )
}