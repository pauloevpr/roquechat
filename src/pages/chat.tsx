import { Accessor, createEffect, createMemo, createSignal, Index, onCleanup, Show, untrack } from "solid-js"
import { convex, useQuery } from "../convex"
import { api } from "../../convex/_generated/api"
import type { ChatModel, MessageModel } from "../../convex/schema"
import { Id } from "../../convex/_generated/dataModel"
import { chatStore, generateDbRecordId } from "../App"
import { createAsync } from "@solidjs/router"
import { createMutable, createStore } from "solid-js/store"

// TODO: CONTINUE: streaming is working enough
// TBD:OPTIONAL: should we use convex to force sync to run when new stuff comes up; consider how much extra load it will cause

export function ChatPage() {
  let store = chatStore.use()
  let chatId = "jd72sq6h6t1g8yc09dh0ndgfz17hjk49"
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


function MessageItem(props: { message: MessageModel }) {
  let store = chatStore.use()
  let [dynamicContent, setDynamicContent] = createSignal<string[] | undefined>(undefined)
  let content = createMemo(() => {
    return dynamicContent() || [props.message.content]
  })

  createEffect(() => {
    console.log("message updated: ", props.message)
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
    <article class="border-2 border-gray-300 rounded-md p-2">
      <Index each={content()}>
        {(chunk) => (
          <span>{chunk()}</span>
        )}
      </Index>
    </article>
  )
}