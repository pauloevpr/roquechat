import { createEffect, createMemo, createResource, createSignal, For, Index, onCleanup, Show, untrack } from "solid-js"
import { api } from "../../convex/_generated/api"
import { Id } from "../../convex/_generated/dataModel"
import { wireStore, Message } from "../lib/store"
import { createStore } from "solid-js/store"
import "highlight.js/styles/github.css";
import { useConvex } from "../lib/convex/provider"
import { createAsync, useSearchParams } from "@solidjs/router"
import { createMarked } from "../components/marked"

// TODO: CONTINUE: since we are syncing live, there is no reason for solid-wire to call sync at startup

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
      chatId: chatId()
    })

    // update the message with the actual one from the server
    setMessages(newMessageIndex, result.message)

    if (!chatId()) {
      setSearchParams({ chatId: result.chatId }, { replace: true })
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
        onClick={() => auth.signOut()}
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
