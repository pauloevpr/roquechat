import { onCleanup, ParentProps } from "solid-js"
import { useConvex } from "./convex/provider"
import { createWireStore } from '../solid-wire';
import type { Chat as ChatSchema, Message as MessageSchema, ModelConfig as ModelConfigSchema } from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

// TODO: consider improving solid-wire so the sync function somehow have access to contexts
import { convex } from './convex/client';

type LocalRecord = { id: string, updatedAt: number, createdAt: number }
export type Chat = ChatSchema & LocalRecord
export type Message = MessageSchema & LocalRecord
export type ModelConfig = ModelConfigSchema & LocalRecord
export type PrivateModelConfig = Pick<ModelConfigSchema, "model" | "apiKey"> & LocalRecord

export const SyncStore = createWireStore({
  name: "sync",
  definition: {
    chats: {} as Chat,
    messages: {} as Message,
    modelConfigs: {} as ModelConfig,
    privateModelConfigs: {} as PrivateModelConfig,
  },
  sync: async ({ records, namespace, syncCursor }) => {
    let request: any = {}
    for (let record of records) {
      if (record.type === "privateModelConfigs") continue  // we dont want to store private models on the server
      if (!request[record.type]) {
        request[record.type] = []
      }
      let serverRecord = {
        id: record.id as Id<"records">,
        state: record.state,
        data: record.data
      }
      // some fields are used only locally; we dont want to send it
      let localFields = ["id", "updatedAt", "createdAt"]
      for (let field of localFields) {
        delete (serverRecord.data as any)[field]
      }
      request[record.type].push(serverRecord)
    }
    let result = await convex.mutation(api.functions.sync, {
      cursor: syncCursor ? Number(syncCursor) : undefined,
      ...request,
    })
    // we intentionally dont want to process the updates from the server 
    // we are doing it in the live sync
    return {
      records: [],
      syncCursor: result.syncCursor,
    }
  }
})

export function LiveSync(props: ParentProps) {
  let store = SyncStore.use()
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
          id: record.id,
          type: record.type,
          state: record.state,
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