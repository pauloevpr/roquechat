import { createEffect, createMemo, createSignal, For, JSX, onMount, Show, untrack, VoidProps } from "solid-js";
import { SyncStore } from "../lib/sync";
import { createAsync, useNavigate } from "@solidjs/router";
import { IconButton } from "../components/buttons";
import { BotMessageSquareIcon, CloseIcon, IconProps, MessageCircleIcon, SquarePenIcon } from "../components/icons";
import { useOpenRouter } from "../lib/openrouter";
import { SelectableModel, setSelectedModelId } from "./models";


export function useSearch(scope: "all" | "chats" | "models") {
  let [open, setOpen] = createSignal(false)
  let dialogRef = undefined as undefined | HTMLDialogElement
  let [everOpened, setEverOpened] = createSignal(false)

  createEffect(() => {
    if (open()) {
      setEverOpened(true)
    }
  })

  function close() {
    setOpen(false)
    dialogRef?.close()
  }

  function onClickOutside(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      close()
    }
  }

  function showSearch() {
    // TODO: use a proper lib for better focus trapping rather than relying on the browser for that
    dialogRef?.showModal()
    setOpen(true)
  }

  function SearchDialog() {
    return (
      <dialog
        ref={dialogRef}
        classList={{
          "hidden": !open(),
          "z-10 fixed top-0 left-0 min-w-screen min-h-screen bg-black/50 flex justify-center": open()
        }}
        onClick={onClickOutside}>
        <Show when={everOpened()}>
          <div class="w-full max-w-xl pt-16" onClick={onClickOutside}>
            <SearchBox open={open()} onClose={close} scope={scope} />
          </div>
        </Show>
      </dialog>
    )
  }

  return { showSearch, SearchDialog }
}


function SearchBox(props: VoidProps<{
  open: boolean,
  onClose: () => void,
  scope: "all" | "chats" | "models"
}>) {
  let navigate = useNavigate()
  let store = SyncStore.use()
  let [search, setSearch] = createSignal("")
  let inputRef = undefined as undefined | HTMLInputElement
  let rootRef = undefined as undefined | HTMLDivElement
  let [groups, setGroups] = createSignal<ResultGroup[]>([])
  let [items, setItems] = createSignal<ResultItem[]>([])
  let [selectedIndex, setSelectedIndex] = createSignal(0)
  let selectedItem = createMemo(() => {
    return items()[selectedIndex()]
  })
  let openRouter = useOpenRouter()

  let models = createMemo(() => {
    if (!openRouter.key) return []
    let openRouterKey = openRouter.key // to make typescript happy
    let models = (openRouter.models).map<SelectableModel>(model => ({
      id: model.id,
      name: model.name,
      apiKey: openRouterKey,
      provider: "openrouter",
    }))
    return models
  })

  let inputPlaceHolder = createMemo(() => {
    switch (props.scope) {
      case "all": return "Search chats, messages, models..."
      case "chats": return "Search chats, messages..."
      case "models": return "Search models..."
      default:
        throw new Error(`Invalid scope ${props.scope}`)
    }
  })

  let chatsAndMessages = createAsync(async () => {
    let chats = (await store.chats.all()).map(chat => ({
      ...chat,
      indexedTitle: chat.title.toLowerCase(),
    })).sort((a, b) => b.lastMessageAt - a.lastMessageAt)
    let messages = (await store.messages.all()).map(message => ({
      ...message,
      indexedContent: message.content.toLowerCase(),
    })).sort((a, b) => b.createdAt - a.createdAt)
    return { chats, messages }
  })

  createEffect(async () => {
    let { chats, messages } = chatsAndMessages() || { chats: [], messages: [] }
    let showChats = props.scope === "all" || props.scope === "chats"
    let showModels = props.scope === "all" || props.scope === "models"
    let input = (search() || "").toLowerCase()
    let groups = [] as ResultGroup[]
    let items: ResultItem[] = []
    let itemIndex = 0
    let commands: ResultItem[] = [
      {
        index: -1,
        title: "New Chat",
        onClick: startNewChat,
        id: "command:new-chat",
        icon: {
          el: SquarePenIcon,
          class: "text-primary"
        }
      },
    ]

    let commandsGroup = { title: "", items: [] as ResultItem[] }
    if (props.scope === "all") {
      for (let item of commands) {
        let matches = !input || item.title.toLowerCase().includes(input)
        if (!matches) continue
        let indexedItem = { ...item, index: itemIndex }
        commandsGroup.items.push(indexedItem)
        items[itemIndex] = indexedItem
        itemIndex++
      }
    }

    let allModelsGroup = { title: `All Models (${models().length})`, items: [] as ResultItem[] }
    if (props.scope === "models" && !input) {
      for (let model of models()) {
        let indexedItem: ResultItem = {
          id: `model:${model.id}`,
          index: itemIndex,
          title: model.name,
          onClick: () => {
            setSelectedModelId(model.id)
            props.onClose()
          },
          tag: "Switch Model",
          icon: { el: BotMessageSquareIcon, class: "text-on-surface-light opacity-50" }
        }
        allModelsGroup.items.push(indexedItem)
        items[itemIndex] = indexedItem
        itemIndex++
      }
    }

    let matchingModelsGroup = { title: "All Models", items: [] as ResultItem[] }
    if (showModels && input) {
      for (let model of models()) {
        let matches = input && model.name.toLowerCase().includes(input)
        if (!matches) continue
        let indexedItem: ResultItem = {
          id: `model:${model.id}`,
          index: itemIndex,
          title: model.name,
          onClick: () => {
            setSelectedModelId(model.id)
            props.onClose()
          },
          tag: "Switch Model",
          icon: { el: BotMessageSquareIcon, class: "text-on-surface-light opacity-50" }
        }
        matchingModelsGroup.items.push(indexedItem)
        items[itemIndex] = indexedItem
        itemIndex++
      }
    }

    let recentChatsGroup = { title: "Recent", items: [] as ResultItem[] }
    if (showChats && !input) {
      let recentChats = chats.slice(0, 5)
      for (let chat of recentChats) {
        let indexedItem: ResultItem = {
          id: `chat:${chat.id}`,
          title: chat.title,
          index: itemIndex,
          onClick: () => {
            props.onClose()
            navigate(`/?chatId=${chat.id}`)
          },
          icon: { el: MessageCircleIcon, class: "text-on-surface-light opacity-50" }
        }
        recentChatsGroup.items.push(indexedItem)
        items[itemIndex] = indexedItem
        itemIndex++
      }
    }

    let chatsGroup = { title: "Chats", items: [] as ResultItem[] }
    if (showChats && input) {
      let matchingChats = new Map<string, { content: string, messageId?: string } | undefined>()
      for (let chat of chats) {
        if (chat.indexedTitle.toLowerCase().includes(input)) {
          matchingChats.set(chat.id, undefined)
        }
      }
      for (let message of messages) {
        if (matchingChats.has(message.chatId)) continue
        let index = message.indexedContent.indexOf(input)
        if (index !== -1) {
          let sliceFrom = Math.max(index - 50, 0)
          let sliceTo = Math.min(index + 100, message.content.length)
          let fragment = message.content.slice(
            sliceFrom,
            sliceTo
          )
          matchingChats.set(message.chatId, { content: fragment, messageId: message.id })
        }
      }
      for (let [chatId, fragment] of matchingChats) {
        let chat = chats.find(chat => chat.id === chatId)
        if (chat) {
          let indexedItem = {
            id: `chat:${chatId}`,
            index: itemIndex,
            title: chat.title,
            fragment,
            onClick: () => {
              props.onClose()
              if (fragment?.messageId) {
                navigate(`/?chatId=${chatId}#${fragment.messageId}`)
              } else {
                navigate(`/?chatId=${chatId}`)
              }
            },
            icon: { el: MessageCircleIcon, class: "text-on-surface-light opacity-50" }
          }
          chatsGroup.items.push(indexedItem)
          items[itemIndex] = indexedItem
          itemIndex++
        }
      }
    }

    if (commandsGroup.items.length > 0) {
      groups.push(commandsGroup)
    }
    if (recentChatsGroup.items.length > 0) {
      groups.push(recentChatsGroup)
    }
    if (matchingModelsGroup.items.length > 0) {
      groups.push(matchingModelsGroup)
    }
    if (chatsGroup.items.length > 0) {
      groups.push(chatsGroup)
    }
    if (allModelsGroup.items.length > 0) {
      groups.push(allModelsGroup)
    }

    untrack(() => {
      setGroups(groups)
      setSelectedIndex(0)
      setItems(items)
    })
  })

  let controls = {
    up: () => {
      let newIndex = selectedIndex() - 1
      if (newIndex < 0) {
        newIndex = items().length - 1
      }
      setSelectedIndex(newIndex)
    },
    down: () => {
      let newIndex = selectedIndex() + 1
      if (newIndex >= items().length) {
        newIndex = 0
      }
      setSelectedIndex(newIndex)
    },
    select: () => {
      let item = items()[selectedIndex()]
      if (item) {
        item.onClick()
      }
    },
  }

  let keyboard = {
    onInputKeyDown(e: KeyboardEvent) {
      const keyMap: Record<string, Function> = {
        "ArrowUp": controls.up,
        "ArrowDown": controls.down,
        "Enter": controls.select
      }
      if (keyMap[e.key]) {
        e.preventDefault()
        e.stopPropagation()
        keyMap[e.key]()
      }
    },
    onRootKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        props.onClose()
      }
    }
  }

  createEffect(() => {
    if (props.open && inputRef) {
      setSearch("")
      inputRef.value = ""
      inputRef.focus()
      setSelectedIndex(0)
    }
  })

  onMount(() => {
    inputRef?.focus()
  })

  function startNewChat() {
    props.onClose()
    navigate("/")
  }

  return (
    <div ref={rootRef}
      class="bg-surface rounded-xl"
      onKeyDown={keyboard.onRootKeyDown}>
      <h1 class="sr-only">Search Everywhere</h1>
      <div class="flex px-6 border-b border-b-on-surface-light/20">
        <input
          ref={inputRef}
          type="text"
          placeholder={inputPlaceHolder()}
          class="outline-none h-16 flex-grow"
          onKeyDown={keyboard.onInputKeyDown}
          onInput={(e) => { setSearch(e.target.value) }}
        />
        <div class="self-center">
          <IconButton label="Close" onClick={props.onClose} icon={CloseIcon} />
        </div>
      </div>
      <div class="space-y-5 py-4 max-h-[500px] overflow-y-auto">
        <For each={groups()}>
          {(group) => (
            <ul class="px-2 ">
              <Show when={group.title}>
                <span class="block px-4 text-primary font-medium text-sm py-2">{group.title}</span>
              </Show>
              <For each={group.items}>
                {(item) => (
                  <li
                    class="group flex items-center hover:bg-surface-2/50 gap-3 rounded-xl px-4 py-3 cursor-default"
                    classList={{
                      "bg-surface-2": item.id === selectedItem()?.id,
                    }}
                    onClick={item.onClick}
                  >
                    <item.icon.el class={`${item.icon.class} size-5`} />
                    <div class="min-w-0 flex-grow">
                      <span class="text-on-surface-strong block">{item.title}</span>
                      <Show when={item.fragment}>
                        {(fragment) => (
                          <span class="block text-on-surface-light overflow-hidden text-ellipsis whitespace-nowrap max-w-[100%]">
                            ...{fragment().content}
                          </span>
                        )}
                      </Show>
                    </div>
                    <Show when={item.tag}>
                      <span class="invisible group-hover:visible block text-primary font-medium"
                        classList={{
                          "!visible": item.id === selectedItem()?.id,
                        }}>{item.tag}</span>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          )}
        </For>
      </div>
    </div>
  )
}



type ResultItem = {
  title: string,
  onClick: () => void,
  id: string,
  index: number,
  fragment?: { content: string, messageId?: string },
  tag?: string,
  icon: { el: (props: IconProps) => JSX.Element, class: string }
}

type ResultGroup = { title: string, items: ResultItem[] }