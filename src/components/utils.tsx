import { Accessor, createEffect, createSignal, onCleanup } from "solid-js"

export function createPersistentSignal<T>(key: string, initialValue: T): [Accessor<T>, (value: T) => void] {
  let storedValue = localStorage.getItem(key)
  if (storedValue) {
    initialValue = JSON.parse(storedValue)
  }
  let [getter, setter] = createSignal(initialValue)
  createEffect(() => {
    let value = getter()
    if (value === null || value === undefined) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, JSON.stringify(value))
    }
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



export function useBreakpoint() {
  const [width, setWidth] = createSignal(window.innerWidth)

  function updateWidth() {
    setWidth(window.innerWidth)
  }

  window.addEventListener('resize', updateWidth)
  onCleanup(() => window.removeEventListener('resize', updateWidth))

  return {
    sm: () => width() >= 640,
    md: () => width() >= 768,
    lg: () => width() >= 1024,
    xl: () => width() >= 1280,
    '2xl': () => width() >= 1536
  }
}