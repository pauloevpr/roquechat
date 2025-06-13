import { createEffect, createMemo, createResource, createSignal, For, Index, onCleanup, Show, untrack } from "solid-js"
import { api } from "../../convex/_generated/api"
import { Id } from "../../convex/_generated/dataModel"
import { wireStore, createRecordId, Message } from "../lib/store"
import { createStore } from "solid-js/store"
import { Marked } from "marked";
import "highlight.js/styles/github.css";
import hljs from 'highlight.js';
import { markedHighlight } from 'marked-highlight';
import DOMPurify from 'dompurify';
import { useConvex } from "../lib/convex/provider"
import { createAsync, useSearchParams } from "@solidjs/router"


// TODO: CONTINUE: since we are syncing live, there is no reason for solid-wire to call sync at startup

export function ChatPage() {
  let store = wireStore.use()
  let [searchParams, setSearchParams] = useSearchParams()
  let chatId = createMemo(() => searchParams.chatId as Id<"records"> | undefined)
  let streaming = createMemo(() => false)
  let { auth, convex } = useConvex()

  let [messages, setMessages] = createStore([] as Message[])

  createEffect((prevChatId: Id<"records"> | undefined) => {
    let id = chatId()
    let chatChanged = id !== prevChatId
    if (!id) {
      untrack(() => {
        setMessages([])
      })
    } else {
      store.messages.all().then(updatedMessages => {
        updatedMessages = updatedMessages.filter(x => x.chatId === id).sort((a, b) => a.createdAt - b.createdAt)
        untrack(() => {
          if (chatChanged) {
            setMessages(updatedMessages)
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

  let inputRef: HTMLInputElement | undefined = undefined

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    let form = e.target as HTMLFormElement
    const formData = new FormData(form)
    const content = (formData.get('message') as string).trim()
    form.reset()
    inputRef?.focus()
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
    <main class="p-10">
      <ChatList />
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
          ref={inputRef} />
        <Show when={!streaming()}>
          <button
            type="submit"
            disabled={streaming()}
          >Send</button>
        </Show>
      </form>
      <button
        class="bg-gray-100 p-2 rounded-md mt-4"
        onClick={() => auth.signOut()}
      >
        Sign Out
      </button>
    </main >
  )
}

function ChatList() {
  let store = wireStore.use()
  let chats = createAsync(async () => {
    let chats = await store.chats.all()
    chats.sort((a, b) => b.updatedAt - a.updatedAt)
    return chats
  })

  return (
    <aside class="border p-4">
      <ul>
        <li>
          <a href="/">New Chat</a>
        </li>
        <For each={chats()}>
          {(chat) => (
            <li>
              <a href={`/?chatId=${chat.id}`}>{chat.title}</a>
            </li>
          )}
        </For>
      </ul>
    </aside>
  )
}

const marked = new Marked(
  markedHighlight({
    emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight(code, lang, info) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    }
  }),
);

marked.use({
  hooks: {
    postprocess: (html: string) => DOMPurify.sanitize(html)
  }
});


function MessageItem(props: { message: Message }) {
  let { convex } = useConvex()
  let store = wireStore.use()
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

  createEffect((count) => {
    if (count !== content().length) {
      window.scrollTo(0, document.body.scrollHeight)
    }
    return content().length
  }, 0)

  onCleanup(() => {
    try {
      unsubscribe?.()
    } catch (e) {
      // sometimes this fails and we dont know why
    }
  })

  return (
    <article class="prose border-2 border-gray-300 rounded-md p-2">
      <div innerHTML={html()} />
    </article>
  )
}
