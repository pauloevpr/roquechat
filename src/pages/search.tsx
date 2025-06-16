import { createEffect, createMemo, createSignal, For, onMount, Show, untrack, VoidProps } from "solid-js";
import { SyncStore } from "../lib/sync";
import { createAsync, useNavigate } from "@solidjs/router";
import { useKeyboardListener } from "../components/utils";


export function useSearch() {
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
          "z-10 fixed top-0 left-0 w-screen h-screen bg-black/50 flex justify-center items-center": open()
        }}
        onClick={onClickOutside}>
        <Show when={everOpened()}>
          <div class="bg-white p-4 rounded-md w-full max-w-xl">
            <SearchBox open={open()} onClose={close} />
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
}>) {
  type Item = { title: string, onClick: () => void, id: string, index: number, fragment?: { content: string, messageId?: string } }
  type Group = { title: string, items: Item[] }
  let navigate = useNavigate()
  let store = SyncStore.use()
  let allMessages = createAsync(async () => {
    return await store.messages.all()
  })
  let [search, setSearch] = createSignal("")
  let inputRef = undefined as undefined | HTMLInputElement
  let rootRef = undefined as undefined | HTMLDivElement
  let [groups, setGroups] = createSignal<Group[]>([])
  let [items, setItems] = createSignal<Item[]>([])
  let [selectedIndex, setSelectedIndex] = createSignal(0)
  let selectedItem = createMemo(() => {
    return items()[selectedIndex()]
  })
  let data = createAsync(async () => {
    let chats = (await store.chats.all()).map(chat => ({
      ...chat,
      indexedTitle: chat.title.toLowerCase(),
    }))
    let messages = (await store.messages.all()).map(message => ({
      ...message,
      indexedContent: message.content.toLowerCase(),
    }))
    return { chats, messages }
  })

  createEffect(async () => {
    let { chats, messages } = data() || { chats: [], messages: [] }
    let input = (search() || "").toLowerCase()
    let groups = [] as Group[]
    let items: Item[] = []
    let itemIndex = 0
    let commands = [
      { title: "New Chat", onClick: startNewChat, id: "command:new-chat" },
    ]
    let commandsGroup = { title: "", items: [] as Item[] }
    for (let item of commands) {
      let matches = !input || item.title.toLowerCase().includes(input)
      if (!matches) continue
      let indexedItem = { ...item, index: itemIndex }
      commandsGroup.items.push(indexedItem)
      items[itemIndex] = indexedItem
      itemIndex++
    }
    let chatsGroup = { title: "Chats", items: [] as Item[] }
    if (input) {
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
    if (chatsGroup.items.length > 0) {
      groups.push(chatsGroup)
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
      onKeyDown={keyboard.onRootKeyDown}>
      <button class="border" onClick={props.onClose}>Close</button>
      <h1 ref={(e) => { }}>Search</h1>
      <input
        ref={inputRef}
        type="text"
        class="border p-2"
        onKeyDown={keyboard.onInputKeyDown}
        onInput={(e) => { setSearch(e.target.value) }}
      />
      <For each={groups()}>
        {(group) => (
          <ul>
            <Show when={group.title}>
              <span class="text-gray-500">{group.title}</span>
            </Show>
            <For each={group.items}>
              {(item) => (
                <li
                  classList={{
                    "bg-blue-100": item.id === selectedItem()?.id,
                  }}
                >
                  <span class="font-medium block">{item.title}</span>
                  <Show when={item.fragment}>
                    {(fragment) => (
                      <span class="block text-gray-500 overflow-hidden text-ellipsis whitespace-nowrap max-w-[100%]">
                        ...{fragment().content}
                      </span>
                    )}
                  </Show>
                </li>
              )}
            </For>
          </ul>
        )}
      </For>
    </div>
  )
}