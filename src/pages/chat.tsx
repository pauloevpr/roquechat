import "highlight.js/styles/github.css";
import { createEffect, createMemo, createResource, createSignal, For, Index, onCleanup, onMount, Show, untrack, VoidProps } from "solid-js"
import { api } from "../../convex/_generated/api"
import { Id } from "../../convex/_generated/dataModel"
import { SyncStore, Message, Chat } from "../lib/sync"
import { createStore } from "solid-js/store"
import { useConvex } from "../lib/convex/provider"
import { createAsync, useLocation, useSearchParams } from "@solidjs/router"
import { createMarked } from "../components/marked"
import { SelectableModel, useModelSelector } from "./models"
import { useSearch } from "./search";
import { useKeyboardListener } from "../components/utils";

export function ChatPage() {
  let { convex } = useConvex()
  let store = SyncStore.use()
  let [messages, setMessages] = createStore([] as Message[])
  let [chatId, setChatId] = useCurrentChatId()
  let [streamingMessageId, setStreamingMessageId] = createSignal<Id<"records"> | undefined>(undefined)
  let streaming = createMemo(() => !!streamingMessageId())
  let [selectedModel, SelectModelButton] = useModelSelector()
  let refs = {
    messages: undefined as undefined | HTMLDivElement,
    input: undefined as undefined | HTMLTextAreaElement
  }

  createEffect((previousChat: Id<"records"> | undefined) => {
    let allMessages = store.messages.all()
    let currentChat = chatId()
    let chatChanged = currentChat !== previousChat
    untrack(() => {
      if (currentChat) {
        allMessages.then(matchingMessages => {
          matchingMessages = matchingMessages.filter(x => x.chatId === currentChat).sort((a, b) => a.createdAt - b.createdAt)
          setMessages(matchingMessages)
        })
      } else {
        setMessages([])
      }
      if (chatChanged) {
        setStreamingMessageId(undefined)
        scrollToBottom()
      }
    })
    return chatId()
  })

  function scrollToBottom() {
    refs.messages?.scrollTo({ top: refs.messages.scrollHeight, behavior: "instant" })
  }

  async function sendMessage(e: SubmitEvent) {
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
    // add a temp message to the list right away for optimistic update
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
        id: model.id,
        apiKey: model.apiKey,
        provider: model.provider,
      }
    })

    // update the temp message with the actual one from the server
    setMessages(newMessageIndex, result.message)

    if (!chatId()) {
      setChatId(result.chatId)
    }
  }

  function onMessageEdited(messageId: string) {
    let index = messages.findIndex(message => message.id === messageId)
    if (index === -1) return
    setMessages(list => [...list].slice(0, index + 1))
  }

  function onMessageStreaming(messageId: string, status: "started" | "finished") {
    if (status === "finished") {
      setStreamingMessageId(undefined)
    } else {
      setStreamingMessageId(messageId as Id<"records">)
    }
  }

  function cancelResponse() {
    let messageId = streamingMessageId()
    if (!messageId) return
    convex.mutation(api.functions.cancelResponse, { messageId: messageId })
  }

  return (
    <div class="grid grid-cols-[auto_1fr]">
      <ChatList />
      <main
        class="relative"
      >
        <div class="relative p-10 overflow-y-auto h-screen"
          ref={refs.messages}
        >
          <div class="space-y-4 py-6 pb-20">
            <Index each={messages}>
              {(message) => (
                <MessageItem
                  message={message()}
                  model={selectedModel()}
                  onEdited={onMessageEdited}
                  onStreaming={(status) => onMessageStreaming(message().id, status)}
                />
              )}
            </Index >
          </div >
        </div>
        <div class="absolute bottom-0 left-0 right-0 bg-blue-100">
          <form onSubmit={sendMessage}
            class="flex gap-2">
            <textarea
              class="border-2 border-gray-300 rounded-md p-2 flex-grow"
              name="message"
              classList={{ "bg-gray-200": streaming() }}
              required
              ref={refs.input} />
            <div>
              <Show when={!streaming()}>
                <button
                  class="bg-blue-500"
                  type="submit"
                  disabled={streaming()}
                >Send</button>
              </Show>
              <Show when={streaming()}>
                <button class="bg-red-500" type="button" onClick={cancelResponse}>Cancel</button>
              </Show>
            </div>
          </form>
          <SelectModelButton />
        </div>
      </main >
    </div>
  )
}


function ChatList() {
  let { auth } = useConvex()
  let store = SyncStore.use()
  let [chatId] = useCurrentChatId()

  let chats = createAsync(async () => {
    let chats = await store.chats.all()
    chats.sort((a, b) => b.lastMessageAt - a.lastMessageAt)
    return chats
  })

  let { showSearch, SearchDialog } = useSearch()

  useKeyboardListener("ctrl", "k", () => {
    showSearch()
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
        <button class="border" onClick={showSearch}>Search</button>
        <For each={chats()}>
          {(chat) => (
            <ChatListItem
              chat={chat}
              selected={chatId() === chat.id}
            />
          )}
        </For>
      </ul>

      <button
        class="bg-gray-100 p-2 rounded-md mt-4"
        onClick={signOut}
      >
        Sign Out
      </button>
      <SearchDialog />
    </aside>
  )
}

function ChatListItem(props: VoidProps<{
  chat: Chat,
  selected: boolean,
}>) {
  let store = SyncStore.use()
  let [editing, setEditing] = createSignal(false)
  let [chatId, setChatId] = useCurrentChatId()

  async function onEditSubmit(e: SubmitEvent) {
    e.preventDefault()
    let form = e.target as HTMLFormElement
    let title = form.querySelector("input")?.value || ""
    if (title) {
      await store.chats.set(props.chat.id, {
        ...props.chat,
        title: title,
      })
    }
    setEditing(false)
  }

  function startEditing(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setEditing(true)
  }

  async function deleteChat() {
    let confirmed = confirm("Are you sure you want to delete this chat and its messages?")
    if (!confirmed) return
    let messages = (await store.messages.all()).filter(x => x.chatId === props.chat.id)
    await store.chats.delete(props.chat.id)
    await store.chats.delete(...messages.map(x => x.id))
    if (chatId() === props.chat.id) {
      setChatId(undefined)
    }
  }

  return (
    <li>
      <Show when={editing()}>
        <form onSubmit={onEditSubmit}>
          <input autofocus type="text" value={props.chat.title} name="title" required />
        </form>
      </Show>
      <Show when={!editing()}>
        <a
          classList={{
            "font-semibold": props.selected,
            "animate-pulse": !props.chat.title
          }}
          class="group whitespace-nowrap text-ellipsis"
          href={`/?chatId=${props.chat.id}`}>
          {props.chat.title || "..."}
          <button
            class="invisible group-hover:visible border"
            onClick={startEditing}>Edit</button>
          <button
            class="invisible group-hover:visible border"
            onClick={deleteChat}>Delete</button>
        </a>
      </Show>
    </li>
  )
}

function MessageItem(props: {
  message: Message,
  model: SelectableModel | undefined,
  onEdited: (messageId: string) => void,
  onStreaming: (status: "started" | "finished") => void,
}) {
  let unsubscribe: Function | undefined = undefined
  let marked = createMarked()
  let { convex } = useConvex()
  let [content, setContent] = createSignal("")
  let [chatId, setChatId] = useCurrentChatId()
  let [editing, setEditing] = createSignal(false)
  let [html] = createResource(content, (content) => {
    return marked.parse(content)
  })
  let canEdit = createMemo(() => props.message.from === "user")

  createEffect(() => {
    setContent(props.message.content)
  })

  createEffect(() => {
    if (unsubscribe) return
    if (props.message.streamId) {
      props.onStreaming("started")
      unsubscribe = convex.onUpdate(
        api.functions.getStream,
        { id: props.message.streamId },
        stream => {
          let newContent = stream?.content || []
          setContent(newContent.join(""))
          if (stream?.finished) {
            props.onStreaming("finished")
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
        id: props.model.id,
        apiKey: props.model.apiKey,
        provider: props.model.provider,
      },
    })
    setContent(content)
    setEditing(false)
    props.onEdited(props.message.id)
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(props.message.content)
  }

  async function branchOff() {
    // TODO: add loading indicator?
    let newChatId = await convex.mutation(api.functions.branchOff, {
      messageId: props.message.id as Id<"records">,
    })
    setChatId(newChatId)
  }

  return (
    <div id={props.message.id}>
      <Show when={!editing()}>
        <article class=" border-2 border-gray-300 rounded-md p-2">
          <div class="prose" innerHTML={html()} />
        </article>
        <Show when={canEdit()}>
          <button class="border" onClick={() => setEditing(true)}>Edit</button>
        </Show>
        <button class="border" onClick={copyToClipboard}>Copy</button>
        <Show when={props.message.from === "assistant"}>
          <button class="border"
            onClick={branchOff}>Branch off</button>
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


function useCurrentChatId() {
  let [searchParams, setSearchParams] = useSearchParams()
  let chatId = createMemo(() => searchParams.chatId as Id<"records"> | undefined)
  function setChatId(id?: string) {
    setSearchParams({ ...searchParams, chatId: id }, { replace: true })
  }
  return [chatId, setChatId] as [typeof chatId, typeof setChatId]
}

