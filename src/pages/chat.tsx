import { createEffect, createMemo, createResource, createSignal, Index, onCleanup, Show, untrack } from "solid-js"
import { api } from "../../convex/_generated/api"
import type { MessageModel } from "../../convex/schema" // TODO: maybe we should import from _generated
import { Id } from "../../convex/_generated/dataModel"
import { wireStore, createRecordId } from "../lib/store"
import { createStore } from "solid-js/store"
import { Marked } from "marked";
import "highlight.js/styles/github.css";
import hljs from 'highlight.js';
import { markedHighlight } from 'marked-highlight';
import DOMPurify from 'dompurify';
import { useConvex } from "../lib/convex/provider"


// TODO: CONTINUE: basic auth is done; next:
// create auth provider + context to wrap protected pages
// figure out how refresh tokens work
// update the schema so the other tables relate to the users
// update solid-wire store mounting to pass userid as namespace

// get the userId to check if it is logged in
// const userId = await getAuthUserId(ctx);

//get user details (the _id is not here in a single field; only use to get more info
// let user = await ctx.auth.getUserIdentity()



export function ChatPage() {
  let store = wireStore.use()
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
    let id = createRecordId()
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

// const result = await client.action(
//   "auth:signIn" as unknown as SignInAction,
//   { provider, params, verifier },
// );
// if (result.redirect !== undefined) {
//   const url = new URL(result.redirect);
//   await storageSet(VERIFIER_STORAGE_KEY, result.verifier!);
//   // Do not redirect in React Native
//   // Using a deprecated property because it's the only explicit check
//   // available, and they set it explicitly and intentionally for this
//   // purpose.
//   if (navigator.product !== "ReactNative") {
//     window.location.href = url.toString();
//   }
//   return { signingIn: false, redirect: url };
// } else if (result.tokens !== undefined) {
//   const { tokens } = result;
//   logVerbose(`signed in and got tokens, is null: ${tokens === null}`);
//   await setToken({ shouldStore: true, tokens });
//   return { signingIn: result.tokens !== null };
// }
// return { signingIn: false };
