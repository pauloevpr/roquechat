import type { Component } from 'solid-js';
import { ChatPage } from './pages/chat';
import { createWireStore } from './solid-wire';
import { ChatModel, MessageModel } from '../convex/schema';
import { convex } from './convex';
import { api } from '../convex/_generated/api';


const App: Component = () => {
  return (
    // TODO: namespace should be the user id
    <chatStore.Provider namespace="some-user">
      <ChatPage />
    </chatStore.Provider>
  )
}


export function generateDbRecordId() {
  const timestamp = new Date().getTime().toString(); // current timestamp
  let randomPart = Math.random().toString(36).substring(2, 10); // random part
  randomPart = (timestamp + randomPart).substring(0, 20); // ensure total length is 20
  return `clientid:${randomPart}`;
}

export const chatStore = createWireStore({
  name: "chats",
  definition: {
    chats: {} as ChatModel,
    messages: {} as MessageModel,
  },
  sync: async ({ records, namespace, syncCursor }) => {
    let chats = records.filter(x => x.type === "chats").map(item => ({
      id: item.id,
      state: item.state,
      data: {
        ...item.data,
        id: item.id
      } as ChatModel
    }))
    let messages = records.filter(x => x.type === "messages").map(item => ({
      id: item.id, state: item.state, data: {
        ...item.data,
        id: item.id
      } as MessageModel
    }))
    let result = await convex.mutation(api.functions.sync, {
      cursor: syncCursor ? Number(syncCursor) : undefined,
      chats,
      messages,
    })
    let updatedRecords = result.records.map(record => ({
      id: record.id,
      alternativeId: record.data.id,
      type: record.type,
      state: record.state,
      data: record.data
    }))
    return {
      records: updatedRecords,
      syncCursor,
    }
  }
})

export default App;
