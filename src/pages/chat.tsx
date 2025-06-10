import { Accessor, createEffect, createMemo, createSignal, Index, Show, untrack } from "solid-js"
import { convex, useQuery } from "../convex"
import { api } from "../../convex/_generated/api"
import type { ChatModel, MessageModel } from "../../convex/schema"
import { Id } from "../../convex/_generated/dataModel"
import { chatStore, generateDbRecordId } from "../App"
import { createAsync } from "@solidjs/router"
import { createMutable, createStore } from "solid-js/store"

// TODO: CONTINUE: streaming the current message in real-time:
// for some reason, this is not working
// consider using effect to load messages; put then in a signal; append the streaming message to the signal and keep it updating;
// this means when the store syncs, the entire array will be relaced and the UI should stay the same


export function ChatPage() {
  let store = chatStore.use()
  let chatId = "jd728ddnn34v4sy5w5bpfgb3497hk2wk"
  let [chat, setChat] = useQuery<ChatModel>(api.functions.getChat, {
    chatId: chatId as Id<"records">
  })
  type Message = { content: string | string[], streaming?: boolean, index: number }
  let messages = createMutable<Message[]>([])

  let orderedMessages = createMemo(() => {
    return [...messages].sort((a, b) => a.index - b.index)
  })
  createEffect(async () => {
    let items = (await store.messages.all()).filter(x => x.chatId === chatId)
    untrack(() => {
      messages.splice(0, messages.length, ...items)
    })
  })

  // createEffect((previous) => {
  //   let current = chat()?.stream
  //   if (!current && previous) {
  //   }
  //   return current
  // })

  createEffect((hadStream) => {
    let stream = chat()?.stream
    // let message: Message | undefined = undefined
    if (stream) {
      // console.log("stream", stream.chunks)
      untrack(() => {
        let message = messages.find(x => x.streaming)
        if (message) {
          console.log("updating streaming message")
          message.content = stream.chunks
        } else {
          let message = { content: stream.chunks, streaming: true, index: messages.length - 0.5 }
          console.log("adding streaming message", message)
          messages.push(message)
        }
      })
    }
    if (!stream && hadStream) {
      untrack(() => {
        let message = messages.find(x => x.streaming)
        if (message) {
          console.log("removing streaming message", message)
          message.streaming = false
        }
      })
    }

    return !!stream
  })

  let streaming = createMemo(() => false)

  let inputRef: HTMLInputElement | undefined = undefined
  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    let form = e.target as HTMLFormElement
    const formData = new FormData(form)
    const message = (formData.get('message') as string).trim()
    form.reset()
    inputRef?.focus()
    if (!message) return
    let nextIndex = messages?.length ?? 0
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
        <Show when={messages === undefined}>
          <div>Loading...</div>
        </Show>
        <Index each={orderedMessages()} >
          {(message) => (
            <MessageItem chunks={message().content} />
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


function MessageItem(props: { chunks: string | string[] }) {
  let chunks = createMemo(() => {
    if (typeof props.chunks === "string") {
      return [props.chunks]
    }
    return props.chunks
  })
  createEffect((count) => {
    if (count !== chunks()?.length) {
      window.scrollTo(0, document.body.scrollHeight)
    }
    return props.chunks.length
  }, 0)
  return (
    <article class="border-2 border-gray-300 rounded-md p-2">
      <Index each={chunks()}>
        {(chunk) => <span>{chunk()}</span>}
      </Index>
    </article>
  )
}