import { createEffect, createMemo, createResource, createSignal, For, Index, onCleanup, onMount, Show, untrack, VoidProps } from "solid-js"
import { api } from "../../convex/_generated/api"
import { SyncStore, Chat } from "../lib/sync"
import { useConvex, useQuery } from "../lib/convex/provider"
import { createAsync, useNavigate } from "@solidjs/router"
import { useSearch } from "./search";
import { useKeyboardListener } from "../components/utils";
import { Button, IconButton } from "../components/buttons";
import { ChevronDownIcon, ChevronRightIcon, CircleStopIcon, CopyIcon, GithubIcon, LogoutIcon, PencilIcon, SearchIcon, SplitIcon, SquarePenIcon, TrashIcon } from "../components/icons";
import { useCurrentChatId } from "./chat";
import { useCurrentUser } from "./protected";
import { Logo } from "../components/logo"

export function SideBar() {
  let navigate = useNavigate()
  let { showSearch, SearchDialog } = useSearch("all")

  function newChat() {
    navigate("/")
  }

  useKeyboardListener("ctrl", "k", () => {
    showSearch()
  })

  return (
    <div class="relative h-screen min-w-xs max-w-xs bg-surface text-on-surface border-r border-on-surface/10">
      <aside class="overflow-y-auto h-full pb-16">
        <div class="flex items-center justify-center gap-6 pt-6 pb-10">
          <Logo />
          <a href="https://github.com/pauloevpr/roquechat"
            aria-label="Link to Github repository"
            class="size-5"
            target="_blank">
            <GithubIcon />
          </a>
        </div>
        <ul class="px-4 space-y-4 pb-8">
          <li >
            <button
              class={`group flex items-center gap-2 w-full h-14 border-2 border-primary-light-2 rounded-full px-4 text-on-surface-light/60
                      hover:bg-primary-light hover:text-on-surface active:bg-primary/20`}
              onClick={showSearch}>
              <SearchIcon class="size-5 text-primary/70 group-hover:text-primary" />
              Search everywhere
            </button>
          </li>
          <li>
            <Button
              label="New Chat"
              style="primary-light"
              fullWidth
              large
              onClick={newChat}
              appendIcon={<SquarePenIcon class="size-4 text-primary ml-1" />}
            />
          </li>
        </ul>
        <ChatList />
        <UserMenu />
        <SearchDialog />
      </aside >
    </div >
  )
}


function ChatList() {
  let store = SyncStore.use()
  let [chatId] = useCurrentChatId()

  let chats = createAsync(async () => {
    let chats = await store.chats.all()
    chats.sort((a, b) => b.lastMessageAt - a.lastMessageAt)
    return chats
  })
  return (
    <div class="">
      <For each={chats()}>
        {(chat) => (
          <ChatListItem
            chat={chat}
            selected={chatId() === chat.id}
          />
        )}
      </For>
    </div>
  )
}

function UserMenu() {
  let { auth } = useConvex()
  let { user } = useCurrentUser()

  return (
    <div class="z-10 absolute bottom-0 left-0 right-0 bg-surface border-t border-on-surface/10">
      <a href="/settings"
        class="w-full flex items-center gap-3 px-6 py-4 ">
        <img
          alt={`${user.name}'s profile picture`}
          src={user.avatar}
          class={`size-10 rounded-full border-4 border-primary/20`}
        />
        <div class="flex-grow">
          <p class="font-medium">{user.name}</p>
        </div>
        <ChevronRightIcon class="size-6 text-on-surface-light [details[open]_&]:rotate-90 transition-transform" />
      </a>
    </div>
  )
}


function ChatListItem(props: VoidProps<{
  chat: Chat,
  selected: boolean,
}>) {
  let store = SyncStore.use()
  let [editing, setEditing] = createSignal(false)
  let [chatId, setChatId] = useCurrentChatId()
  let inputRef = undefined as HTMLInputElement | undefined

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
    inputRef?.focus()
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

  function onInputKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      setEditing(false)
    }
  }

  return (
    <div class="relative">
      <article class={`group flex items-center relative px-5 h-10 hover:bg-primary-light`}
        classList={{
          "bg-primary-light": props.selected,
        }}>
        <header class="sr-only">{props.chat.title}</header>
        <div class="absolute left-0 top-0 w-1 h-full bg-transparent rounded-r-xl py-2"
          classList={{
            "!bg-primary": props.selected,
          }}
        ></div>
        <Show when={editing()}>
          <form onSubmit={onEditSubmit}
            class="w-full">
            <input
              ref={inputRef}
              onKeyDown={onInputKeyDown}
              class="h-10 w-full outline-primary"
              type="text" value={props.chat.title} name="title" required />
          </form>
        </Show>
        <Show when={!editing()}>
          <a
            class="w-full whitespace-nowrap text-ellipsis overflow-hidden group-hover:text-on-surface-strong"
            classList={{
              "font-medium": props.selected,
              "text-on-surface-light": !props.selected,
              "animate-pulse text-primary": !props.chat.title
            }}
            href={`/?chatId=${props.chat.id}`}>
            {props.chat.title || "Answering..."}
          </a>
          <div class="group absolute -right-0 top-0 flex invisible group-hover:visible ">
            <div class="min-w-10 min-h-full bg-linear-to-r from-transparent to-primary-light text-transparent"
              style="min-height: 100%;">
              _
            </div>
            <div class="bg-primary-light">
              <div class="opacity-50 group-hover:opacity-100 flex items-center -space-x-2">
                <IconButton
                  label="Edit"
                  class="border"
                  onClick={startEditing}
                  icon={PencilIcon}
                />
                <IconButton
                  label="Delete"
                  class="border"
                  onClick={deleteChat}
                  icon={TrashIcon}
                />
              </div>
            </div>
          </div>
        </Show>
      </article>
    </div >
  )
}