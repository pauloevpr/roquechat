import { Accessor, createEffect, createSignal } from "solid-js"

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