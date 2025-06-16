import { Accessor, createEffect, createSignal, onCleanup } from "solid-js"

export function createPersistentSignal<T>(key: string, initialValue: T): [Accessor<T>, (value: T) => void] {
  let storedValue = localStorage.getItem(key)
  if (storedValue) {
    initialValue = JSON.parse(storedValue)
  }
  let [getter, setter] = createSignal(initialValue)
  createEffect(() => {
    localStorage.setItem(key, JSON.stringify(getter()))
  })
  return [getter, setter]
}




export function useKeyboardListener(
  modifier: "ctrl" | "meta" | undefined,
  key: string,
  callback: () => void,
) {

  function onKeyDown(event: KeyboardEvent) {
    let e = event as KeyboardEvent
    if (
      e.key === key &&
      ((modifier === "ctrl" && e.ctrlKey) || (modifier === "meta" && e.metaKey)) &&
      !e.repeat
    ) {
      e.preventDefault()
      e.stopPropagation()
      callback()
    }
  }

  document.addEventListener("keydown", onKeyDown)
  onCleanup(() => {
    document.removeEventListener("keydown", onKeyDown)
  })
}
