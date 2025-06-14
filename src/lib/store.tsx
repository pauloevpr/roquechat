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

export const wireStore = createWireStore({
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
      // data.id is only used locally; we dont want to send it
      delete (serverRecord.data as any).id
      request[record.type].push(serverRecord)
    }
    let result = await convex.mutation(api.functions.sync, {
      cursor: syncCursor ? Number(syncCursor) : undefined,
      ...request,
    })
    let updatedRecords = result.records.map(record => ({
      id: record.id,
      type: record.type,
      state: record.state,
      // we want data.id to be the server-assigned ID to avoid having client-side IDs
      // data.id is only used locally; we will remove it when syncing back to the server
      data: {
        ...record.data,
        id: record.id,
        updatedAt: record.updatedAt,
        createdAt: record.createdAt
      }
    }))
    console.log("sync: result", updatedRecords)
    return {
      records: updatedRecords,
      syncCursor: result.syncCursor,
    }
  }
})