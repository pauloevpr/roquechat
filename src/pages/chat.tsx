import { Accessor, createEffect, createMemo, createResource, createSignal, Index, onCleanup, Show, untrack } from "solid-js"
import { convex, useQuery } from "../convex"
import { api } from "../../convex/_generated/api"
import type { ChatModel, MessageModel } from "../../convex/schema"
import { Id } from "../../convex/_generated/dataModel"
import { chatStore, generateDbRecordId } from "../App"
import { createAsync } from "@solidjs/router"
import { createMutable, createStore } from "solid-js/store"
import { Marked } from "marked";
import "highlight.js/styles/github.css";
import hljs from 'highlight.js';
import { markedHighlight } from 'marked-highlight';
import DOMPurify from 'dompurify';



export function ChatPage() {
  let store = chatStore.use()
  let chatId = "j5757hka6egxk0t3z56j4y4dtx7hk0aw"
  let streaming = createMemo(() => false)

  let [messages, setMessages] = createStore([] as MessageModel[])

  createEffect(async () => {
    let items = (await store.messages.all())
      .filter(x => x.chatId === chatId)
      .sort((a, b) => a.index - b.index)
    if (messages.length) {
      let newMessages: MessageModel[] = []
      for (let i = messages.length; i < items.length; i++) {
        newMessages.push(items[i])
      }
      setMessages(prev => [...prev, ...newMessages])
    } else {
      setMessages(items)
    }
  })

  let inputRef: HTMLInputElement | undefined = undefined
  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    let form = e.target as HTMLFormElement
    const formData = new FormData(form)
    const message = (formData.get('message') as string).trim()
    form.reset()
    inputRef?.focus()
    if (!message) return
    let nextIndex = messages.length
    let id = generateDbRecordId()
    await store.messages.set(id, {
      content: message,
      chatId: chatId as Id<"records">,
      index: nextIndex,
      from: "user"
    })
  }

  return (
    <main class="p-10">
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
    </main >
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


function MessageItem(props: { message: MessageModel }) {
  let store = chatStore.use()
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
      console.log("subscribing to message", props.message.streamId)
      unsubscribe = convex.onUpdate(
        api.functions.getStream,
        { id: props.message.streamId },
        stream => {
          let newContent = stream?.content || []
          setDynamicContent(newContent)
          if (stream?.finished) {
            console.log("unsubscribing from message", props.message.streamId)
            unsubscribe?.()
            console.log("syncing store")
            store.sync()
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
    unsubscribe?.()
  })

  return (
    <article class="prose border-2 border-gray-300 rounded-md p-2">
      <div innerHTML={html()} />
    </article>
  )
}