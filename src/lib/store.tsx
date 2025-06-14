
import { createWireStore } from '../solid-wire';
import type { Chat as ChatSchema, Message as MessageSchema } from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

// TODO: consider improving solid-wire so the sync function somehow have access to contexts
import { convex } from './convex/client';

type LocalRecord = { id: string, updatedAt: number, createdAt: number }

export type Chat = ChatSchema & LocalRecord
export type Message = MessageSchema & LocalRecord

export const wireStore = createWireStore({
  name: "sync",
  definition: {
    chats: {} as Chat,
    messages: {} as Message,
  },
  options: {
    syncOnStartup: false, // we will trigger sync manually as convex sends us new updates
  },
  sync: async ({ records, namespace, syncCursor }) => {
    let chats = records.filter(x => x.type === "chats").map(item => {
      let record = {
        id: item.id as Id<"records">,
        state: item.state,
        data: item.data as Chat
      }
      // data.id is only used locally; we dont want to send it
      delete (record.data as any).id
      return record
    })
    let messages = records.filter(x => x.type === "messages").map(item => {
      let record = {
        id: item.id as Id<"records">,
        state: item.state,
        data: item.data as Message
      }
      // data.id is only used locally; we dont want to send it
      delete (record.data as any).id
      return record
    })
    let result = await convex.mutation(api.functions.sync, {
      cursor: syncCursor ? Number(syncCursor) : undefined,
      chats,
      messages,
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

