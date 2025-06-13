import { onCleanup, ParentProps } from "solid-js"
import { useConvex } from "./convex/provider"
import { wireStore } from "./store"
import { api } from "../../convex/_generated/api"

export function LiveSync(props: ParentProps) {
  let store = wireStore.use()
  let { convex } = useConvex()

  let unsubscribe: (() => void) | undefined = undefined

  function restartListener() {
    cleanup()
    let cursorRaw = store.sync.cursor()
    let cursor = cursorRaw ? parseInt(cursorRaw) : undefined

    unsubscribe = convex.onUpdate(api.functions.liveSync, { cursor }, async (update) => {
      console.log("live:sync: update received", update)
      if (update.records.length === 0) return
      await store.sync({
        records: update.records.map(record => ({
          ...record,
          data: {
            ...record.data,
            id: record.id,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
          }
        })),
        syncCursor: update.syncCursor,
      })
      cleanup()
      restartListener()
    }).unsubscribe
  }

  function cleanup() {
    try {
      unsubscribe?.()
      unsubscribe = undefined
    } catch (e) {
      console.error("live:sync: error cleaning up ", e)
    }
  }

  onCleanup(cleanup)

  restartListener()

  return props.children
}