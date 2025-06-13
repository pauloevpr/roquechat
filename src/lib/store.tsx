
import { createWireStore } from '../solid-wire';
import { ChatModel, MessageModel } from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import { Id, DataModel } from '../../convex/_generated/dataModel';

// TODO: consider improving solid-wire so the sync function somehow have access to contexts
import { convex } from './convex/client';

export type Chat = ChatModel & { id: string }
export type Message = MessageModel & { id: string }

export const wireStore = createWireStore({
  name: "sync",
  definition: {
    chats: {} as Chat,
    messages: {} as Message,
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
      // data.id is only used locally; we want it to be the same as the record id given by the server to avoid having client-side IDs
      data: { ...record.data, id: record.id }
    }))
    return {
      records: updatedRecords,
      syncCursor: result.syncCursor,
    }
  }
})


export function createRecordId() {
  const timestamp = new Date().getTime().toString(); // current timestamp
  let randomPart = Math.random().toString(36).substring(2, 10); // random part
  randomPart = (timestamp + randomPart).substring(0, 20); // ensure total length is 20
  return `clientid:${randomPart}`;
}
