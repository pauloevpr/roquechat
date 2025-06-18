import "highlight.js/styles/github.css";
import { Accessor, createEffect, createMemo, createResource, createSignal, Index, onCleanup, Show, untrack } from "solid-js"
import { api } from "../../convex/_generated/api"
import { Id } from "../../convex/_generated/dataModel"
import { SyncStore, Message } from "../lib/sync"
import { createStore } from "solid-js/store"
import { useConvex, useQuery } from "../lib/convex/provider"
import { useSearchParams } from "@solidjs/router"
import { createMarked } from "../components/marked"
import { SelectableModel, useModelSelector } from "./models"
import { useOpenRouterSetup } from "./openrouter";
import { Button, IconButton } from "../components/buttons";
import { BotMessageSquareIcon, ChevronDownIcon, CircleStopIcon, CopyIcon, PencilIcon, SplitIcon } from "../components/icons";
import { SideBar, SideBarButton } from "./aside";
import { useOpenRouter } from "../lib/openrouter";
import { useSearch } from "./search";
import { useCurrentUser } from "./protected";
import { useBreakpoint } from "../components/utils";


export function ChatPage() {
  let { convex } = useConvex()
  let store = SyncStore.use()
  let [messages, setMessages] = createStore([] as Message[])
  let [chatId, setChatId] = useCurrentChatId()
  let [streamingMessageId, setStreamingMessageId] = createSignal<Id<"records"> | undefined>(undefined)
  let streaming = createMemo(() => !!streamingMessageId())
  let { selectedModel } = useModelSelector()
  let { showOpenRouterSetup, OpenRouterSetupDialog } = useOpenRouterSetup()
  let { showSearch, SearchDialog } = useSearch("models")
  let openRouter = useOpenRouter()
  let trialStatus = useQuery(api.functions.getTrialStatus, {})
  let [showTrialWarning, setShowTrialWarning] = createSignal(false)
  let trialWarning = createMemo(() => {
    let status = trialStatus()
    if (status && (showTrialWarning() || status.remaining <= 0) && !openRouter.key) {
      return {
        expired: status.remaining <= 0,
        remaining: status.remaining
      }
    }
  })

  let refs = {
    messages: undefined as undefined | HTMLDivElement,
    input: undefined as undefined | HTMLTextAreaElement,
    send: undefined as undefined | HTMLButtonElement,
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
        requestAnimationFrame(() => {
          refs.input?.focus()
        })
      }
    })
    return chatId()
  })

  function scrollToBottom() {
    // HACK: investigate why this does not work without a delay;  
    // solid's rendering is synchronous, so the render should all be done by the time we try to scroll to the bottom, but for some reason the rendering is not done
    setTimeout(() => {
      if (refs.messages) {
        refs.messages.scrollTop = refs.messages.scrollHeight
      }
    }, 20)
  }

  async function sendMessage(e: SubmitEvent) {
    e.preventDefault()
    let form = e.target as HTMLFormElement
    const formData = new FormData(form)
    const content = (formData.get('message') as string).trim()
    form.reset()
    if (refs.input) {
      refs.input.focus()
      refs.input.style.height = 'auto';
    }
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

    setShowTrialWarning(true)
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

  async function cancelResponse() {
    let messageId = streamingMessageId()
    if (!messageId) return
    await convex.mutation(api.functions.cancelResponse, { messageId: messageId })
  }

  let inputHandlers = {
    onInput: (e: InputEvent) => {
      const textarea = e.currentTarget as HTMLTextAreaElement;
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 200);
      textarea.style.height = `${newHeight}px`;
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        refs.send?.click();
      }
    }
  }

  function onStartModelSelection() {
    if (openRouter.key) {
      showSearch()
    } else {
      showOpenRouterSetup()
    }
  }
  let breakpoint = useBreakpoint()

  return (
    <div class="lg:grid grid-cols-[320px_1fr]">
      <Show when={breakpoint.lg()}>
        <SideBar />
      </Show>
      <Show when={!breakpoint.lg()}>
        <SideBarButton />
      </Show>
      <main class="relative">
        <div class="relative py-10 px-1 sm:px-10 overflow-y-auto h-screen"
          ref={refs.messages}
        >
          <div class="space-y-2 py-6 pb-36 max-w-2xl mx-auto pl-4 pr-2">
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
        <div class="absolute bottom-0 w-full bg-background">
          <Show when={trialWarning()}>
            {warning => (
              <div class="flex items-center justify-center gap-1 flex-wrap bg-surface-2 px-2 py-2 rounded-t-2xl w-full max-w-xl mx-auto ">
                <p class="">
                  You have {warning().remaining} messages left.
                </p>
                <span>
                  <button onClick={showOpenRouterSetup} class="text-primary font-medium hover:underline">Connect OpenRouter</button>
                  {` `}to unlock more.
                </span>
              </div>
            )}
          </Show>
          <div class="bg-surface text-on-surface border border-on-surface/10 rounded-t-2xl max-w-2xl mx-auto">
            <div class="pb-2">
              <form
                id="chat-input"
                onSubmit={sendMessage}
              >
                <textarea
                  class="px-4 pt-5 w-full rounded-t-2xl outline-none resize-none overflow-y-auto min-h-[40px] max-h-[200px]"
                  name="message"
                  required
                  placeholder="Your message"
                  ref={refs.input}
                  {...inputHandlers}
                />
              </form>
              <div class="flex items-end px-4">
                <div class="flex-grow">
                  <Button
                    label={selectedModel()?.name || "Select Model"}
                    style="neutral"
                    onClick={onStartModelSelection}
                    type="button"
                    appendIcon={<ChevronDownIcon />}
                  />
                </div>
                <Show when={!streaming()}>
                  <Button
                    ref={refs.send}
                    label="Send"
                    style="primary"
                    type="submit"
                    form="chat-input"
                    disabled={streaming()}
                  />
                </Show>
                <Show when={streaming()}>
                  <Button
                    label="Stop"
                    style="neutral"
                    type="button"
                    onClick={cancelResponse}
                    icon={<CircleStopIcon class="size-6 text-primary/50" />}
                  />
                </Show>
              </div>
            </div>
          </div>
        </div>
      </main >
      <SearchDialog />
      <OpenRouterSetupDialog />
    </div >
  )
}


function MessageItem(props: {
  message: Message,
  model: SelectableModel | undefined,
  onEdited: (messageId: string) => void,
  onStreaming: (status: "started" | "finished") => void,
}) {
  let { user } = useCurrentUser()
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
  let refs = {
    input: undefined as undefined | HTMLTextAreaElement,
    send: undefined as undefined | HTMLButtonElement,
  }

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

  function enableEditing() {
    setEditing(true)
    refs.input?.focus()
  }


  let inputHandlers = {
    onInput: (e: InputEvent) => {
      const textarea = e.currentTarget as HTMLTextAreaElement;
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 200);
      textarea.style.height = `${newHeight}px`;
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditing(false)
      }
    }
  }

  function CopyButton() {
    // TODO: add animation
    return (
      <IconButton
        icon={CopyIcon}
        label="Copy Message"
        onClick={copyToClipboard}
      />
    )
  }

  return (
    <div id={props.message.id}>
      <Show when={!editing()}>
        <div class="group relative">
          <div class="flex">
            <article class="w-full"
              classList={{ "bg-surface rounded-2xl text-on-surface px-4 py-3": props.message.from === "user" }}>
              <div class="max-w-none prose prose-code:overflow-x-auto prose-pre:p-1 prose-pre:bg-surface prose-pre:border prose-pre:rounded-none prose-pre:rounded-t-lg" innerHTML={html()} />
            </article>
            <Show when={props.message.from === "user"}>
              <img
                alt={`${user.name}'s profile picture`}
                src={user.avatar}
                class={`size-6 rounded-full border-2 border-primary/20 mt-2 ml-2`}
              />
            </Show>
          </div>
          <Show when={props.message.from === "user"}>
            <div class="relative">
              <div class=" flex flex-row-reverse flex invisible group-hover:visible pl-2 pr-6 pt-1 ">
                <Show when={canEdit()}>
                  <IconButton
                    icon={PencilIcon}
                    label="Edit Message"
                    onClick={enableEditing}
                  />
                </Show>
                <CopyButton />
              </div>
            </div>
          </Show>
          <Show when={props.message.from === "assistant" && !props.message.streamId}>
            <div class="flex flex opacity-20 group-hover:opacity-100 -ml-2">
              <CopyButton />
              <IconButton
                icon={SplitIcon}
                label="Branch off as new chat"
                onClick={branchOff}
              />
            </div>
          </Show>
        </div>
      </Show>
      <Show when={editing()}>
        <form
          class="bg-surface text-on-surface border border-on-surface/10 rounded-2xl p-4"
          onSubmit={onEditSubmit}>
          <textarea
            ref={refs.input}
            name="content"
            required
            class="w-full outline-none resize-none overflow-y-auto min-h-[40px] max-h-[200px] "
            value={content()}
            {...inputHandlers}
          />
          <div class="flex gap-2">
            <Button
              ref={refs.send}
              label="Save"
              style="primary"
              type="submit"
            />
            <Button
              label="Cancel"
              style="neutral"
              onClick={() => setEditing(false)}
              type="button"
            />
          </div>
        </form>
      </Show>
    </div>
  )
}


export function useCurrentChatId() {
  let [searchParams, setSearchParams] = useSearchParams()
  let chatId = createMemo(() => searchParams.chatId as Id<"records"> | undefined)
  function setChatId(id?: string) {
    setSearchParams({ ...searchParams, chatId: id }, { replace: true })
  }
  return [chatId, setChatId] as [typeof chatId, typeof setChatId]
}

