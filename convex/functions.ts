import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { DataModel, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { ChatSchema, Message, RecordBase, MessageSchema, ModelConfigSchema, RecordType, RecordWithChatData, RecordWithMessageData } from "./schema";
import { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ai, supportedModels } from "./llm";

export const cancelResponse = mutation({
  args: {
    messageId: v.id("records")
  },
  handler: async (ctx, { messageId }) => {
    let userId = await getRequiredUserId(ctx)
    let messageRecord = await ctx.db.get(messageId)
    let message = validate.message(messageRecord, userId, "assistant")
    if (!message.data.streamId) return
    let stream = await ctx.db.get(message.data.streamId)
    if (!stream) return
    await ctx.db.patch(stream._id, {
      finished: true,
    })
    await ctx.db.patch(messageId, {
      updatedAt: Date.now(),
      data: {
        ...message.data,
        content: stream.content.join(""),
        streamId: undefined,
      }
    })
  }
})

export const editMessage = mutation({
  args: {
    messageId: v.id("records"),
    content: v.string(),
    model: v.object({
      name: v.string(),
      apiKey: v.string(),
    }),
  },
  handler: async (ctx, { messageId, content, model }) => {
    let userId = await getRequiredUserId(ctx)
    let messageRecord = await ctx.db.get(messageId)
    let message = validate.message(messageRecord, userId, "user")
    let chatRecord = await ctx.db.get((message.data as Message).chatId)
    let chat = validate.chat(chatRecord, userId)
    let messageData = message.data as Message
    let now = Date.now()
    messageData.content = content
    await ctx.db.patch(messageId, {
      updatedAt: now,
      data: messageData,
    })
    let messagesToDelete = await ctx.db.query("records")
      .withIndex("by_chatId_deleted",
        (q) => q.eq("data.chatId", chat._id).eq("deleted", false)
      )
      .collect()
    for (let deletingMessage of messagesToDelete) {
      if (
        deletingMessage._id === messageId ||
        deletingMessage._creationTime <= message._creationTime ||
        deletingMessage.deleted) {
        continue
      }
      await ctx.db.patch(deletingMessage._id, {
        deleted: true,
        updatedAt: now,
      })
    }

    let streamId = await ctx.db.insert("streams", {
      content: [],
      finished: false,
      updatedAt: now,
      userId
    })
    let responseMessageId = await ctx.db.insert("records", {
      type: "messages",
      deleted: false,
      updatedAt: now,
      data: {
        chatId: chat._id,
        content: "",
        streamId,
        from: "assistant",
      },
      userId,
    })

    ctx.scheduler.runAfter(0, internal.functions.startStream, {
      streamId,
      chatId: chat._id,
      chatTitle: chat.data.title,
      responseMessageId,
      model: {
        name: model.name,
        apiKey: model.apiKey,
      },
    })
    return {
      message: { ...messageData, id: messageId }
    }
  }
})

export const getModels = query({
  args: {},
  handler: async (ctx) => {
    await getRequiredUserId(ctx);
    let result: { vendor: string, name: string }[] = []
    for (let vendor of Object.keys(supportedModels)) {
      for (let name of Object.keys((supportedModels as any)[vendor])) {
        result.push({ vendor, name })
      }
    }
    return result
  }
})

export const saveModelConfig = mutation({
  args: {
    model: v.string(),
    apiKey: v.string(),
  },
  handler: async (ctx, { model, apiKey }) => {
    let userId = await getRequiredUserId(ctx)
    await ctx.db.insert("records", {
      userId,
      type: "modelConfigs",
      updatedAt: Date.now(),
      deleted: false,
      data: {
        model,
        apiKey,
      },
    })
  }
})

export const liveSync = query({
  args: {
    cursor: v.optional(v.number())
  },
  handler: async (ctx, { cursor }) => {
    let userId = await getRequiredUserId(ctx);
    return getSyncUpdates(ctx, userId, cursor ?? 0)
  }
})

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    let userId = await getRequiredUserId(ctx);
    let user = await ctx.db.get(userId)!
    return {
      id: userId,
      name: user?.name || "",
    }
  }
})

export const getStream = query({
  args: {
    id: v.id("streams")
  },
  handler: async (ctx, { id }) => {
    let userId = await getRequiredUserId(ctx);
    let stream = await ctx.db.get(id)
    if (!stream || stream.userId !== userId) throw new Error(`Stream ${id} not found`)
    return stream
  }
})

export const sync = mutation({
  args: {
    cursor: v.optional(v.number()),
    chats: v.optional(v.array(
      v.object({
        id: v.id("records"),
        state: v.union(v.literal("updated"), v.literal("deleted")),
        data: ChatSchema,
      })
    )),
    messages: v.optional(v.array(
      v.object({
        id: v.id("records"),
        state: v.union(v.literal("updated"), v.literal("deleted")),
        data: MessageSchema,
      })
    )),
    modelConfigs: v.optional(v.array(
      v.object({
        id: v.id("records"),
        state: v.union(v.literal("updated"), v.literal("deleted")),
        data: ModelConfigSchema,
      })
    ))
  },
  handler: async (ctx, args) => {
    // TODO: should we limit the amount of records we proccess at a time?
    let userId = await getRequiredUserId(ctx)
    let allRecords = [
      ...(args.chats ?? []).map(x => ({ ...x, type: "chats" as RecordType })),
      ...(args.messages ?? []).map(x => ({ ...x, type: "messages" as RecordType })),
      ...(args.modelConfigs ?? []).map(x => ({ ...x, type: "modelConfigs" as RecordType })),
    ]
    for (let record of allRecords) {
      let existingRecord = await ctx.db.get(record.id)
      if (!existingRecord) {
        console.warn(`Unable to sync record ${record.id} for user ${userId}. Record does not exist.`)
        continue
      }
      if (existingRecord.userId !== userId) {
        console.warn(`Unable to sync record ${record.id} for user ${userId}. Record does not belong to user.`)
        continue
      }
      await ctx.db.patch(record.id, {
        deleted: record.state === "deleted",
        updatedAt: Date.now(),
        data: record.data
      })
    }
    let cursor = args.cursor ?? 0
    return await getSyncUpdates(ctx, userId, cursor)
  }
})

export const sendMessage = mutation({
  args: {
    message: v.string(),
    chatId: v.optional(v.id("records")),
    model: v.object({
      name: v.string(),
      apiKey: v.string(),
    }),
  },
  handler: async (ctx, { message, chatId, model }) => {
    let userId = await getRequiredUserId(ctx)
    let now = Date.now()
    let chatTitle = ""
    if (chatId) {
      let chatRecord = await ctx.db.get(chatId)
      let chat = validate.chat(chatRecord, userId)
      await ctx.db.patch(chatId, {
        updatedAt: now,
        data: { ...chat.data, lastMessageAt: now }
      })
      chatTitle = chat.data.title
    } else {
      chatId = await ctx.db.insert("records", {
        type: "chats",
        updatedAt: now,
        deleted: false,
        data: {
          title: chatTitle,
          lastMessageAt: now,
        },
        userId
      })
    }
    let newMessage: Message = {
      chatId,
      content: message,
      streamId: undefined,
      from: "user",
    }
    let messageId = await ctx.db.insert("records", {
      type: "messages",
      updatedAt: now + 1, // so it appears before the response
      deleted: false,
      data: newMessage,
      userId
    })
    let streamId = await ctx.db.insert("streams", {
      content: [],
      finished: false,
      updatedAt: now,
      userId
    })
    let responseMessageId = await ctx.db.insert("records", {
      type: "messages",
      deleted: false,
      updatedAt: now + 3, // so the response appears after the user's message
      data: {
        chatId: newMessage.chatId,
        content: "",
        streamId,
        from: "assistant",
      },
      userId,
    })
    ctx.scheduler.runAfter(0, internal.functions.startStream, {
      streamId,
      chatId,
      chatTitle,
      responseMessageId,
      model,
    })
    return {
      chatId,
      message: { ...newMessage, id: messageId }
    }
  }
})

export const getMessagesForChat = internalQuery({
  args: {
    chatId: v.id("records")
  },
  handler: async (ctx, { chatId }) => {
    let messages = await ctx.db
      .query("records")
      .withIndex("by_chatId_deleted",
        (q) => q.eq("data.chatId", chatId).eq("deleted", false)
      )
      .collect()
    return messages as RecordWithMessageData[]
  }
})

export const startStream = internalAction({
  args: {
    streamId: v.id("streams"),
    chatId: v.id("records"),
    chatTitle: v.string(),
    responseMessageId: v.id("records"),
    model: v.object({
      name: v.string(),
      apiKey: v.string()
    })
  },
  handler: async (ctx, { streamId, chatId, chatTitle, responseMessageId, model }) => {
    let chatHistory = (
      await ctx.runQuery(internal.functions.getMessagesForChat, {
        chatId: chatId
      }))
      .sort((a, b) => a._creationTime - b._creationTime)
      .map(message => ({ role: message.data.from, content: message.data.content }))
      .filter(x => x.content.length > 0)
    try {
      let abort = new AbortController()
      await ai.model(model.name, model.apiKey, abort.signal).stream(chatHistory, async (content) => {
        if (content) {
          let result = await ctx.runMutation(internal.functions.appendStreamContent, {
            streamId,
            messageId: responseMessageId,
            content: content,
            final: false,
          })
          if (result === "cancelled") {
            abort.abort()
          }
        }
      })
      await ctx.runMutation(internal.functions.appendStreamContent, {
        streamId,
        messageId: responseMessageId,
        content: "",
        final: true,
      })
      if (!chatTitle) {
        let responseContent = await ctx.runQuery(internal.functions.getStreamContent, { streamId })
        let newTitle = await ai.model(model.name, model.apiKey, abort.signal).chat(
          [
            ...chatHistory,
            { role: "assistant", content: responseContent },
            { role: "user", content: "Based on our conversation, give me a short title (max 5 words) for this chat. Return nothing but the title." }
          ],
        )
        if (newTitle) {
          await ctx.runMutation(internal.functions.updateChatTitle, {
            chatId,
            title: newTitle,
          })
        }
      }
    } catch (error: any) {
      if (error.name === "AbortError") return
      await ctx.runMutation(internal.functions.appendStreamContent, {
        streamId,
        messageId: responseMessageId,
        content: `Failed: ${error}`,
        final: true,
      })
    } finally {
      let deleteAfter = 2 * 60 * 60 * 1000 // 2 hours
      await ctx.scheduler.runAfter(deleteAfter, internal.functions.deleteStream, { streamId })
    }
  }
})

export const getStreamContent = internalQuery({
  args: {
    streamId: v.id("streams")
  },
  handler: async (ctx, { streamId }) => {
    let stream = await ctx.db.get(streamId)
    if (!stream) throw new Error(`Stream ${streamId} not found`)
    return stream.content.join("")
  }
})

export const appendStreamContent = internalMutation({
  args: {
    streamId: v.id("streams"),
    messageId: v.id("records"),
    content: v.string(),
    final: v.boolean(),
  },
  handler: async (ctx, { streamId, messageId, content, final }): Promise<"cancelled" | undefined> => {
    let stream = await ctx.db.get(streamId)
    if (!stream) throw new Error(`Stream ${streamId} not found`)
    if (stream.finished) return "cancelled"
    let message = await ctx.db.get(messageId)
    if (!message || message.deleted) {
      await ctx.db.patch(streamId, {
        finished: final,
        updatedAt: Date.now()
      })
      return "cancelled"
    }
    let newContent = [...stream.content, content]
    await ctx.db.patch(streamId, {
      content: newContent,
      finished: final,
      updatedAt: Date.now()
    })
    if (final) {
      let messageData = message.data as Message
      await ctx.db.patch(messageId, {
        updatedAt: Date.now(),
        data: {
          ...messageData,
          content: newContent.join(""),
          streamId: undefined,
        }
      })
    }
  }
})

export const deleteStream = internalMutation({
  args: {
    streamId: v.id("streams")
  },
  handler: async (ctx, { streamId }) => {
    await ctx.db.delete(streamId)
  }
})

async function getRequiredUserId(ctx: GenericMutationCtx<DataModel> | GenericQueryCtx<DataModel>) {
  let userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("User not authenticated")
  return userId
}

async function getSyncUpdates(
  ctx: GenericMutationCtx<DataModel> | GenericQueryCtx<DataModel>,
  userId: Id<"users">,
  cursor: number,
) {
  let updatedRecordsRaw = (await ctx.db
    .query("records")
    .withIndex("by_userId_updatedAt", (q) =>
      q.eq("userId", userId).gt("updatedAt", cursor + 1)
    )
    .collect()
  ).sort((a, b) => a.updatedAt - b.updatedAt)
  let updatedRecords = updatedRecordsRaw.map(x => {
    let record = {
      id: x._id,
      state: (x.deleted ? "deleted" : "updated") as "updated" | "deleted",
      type: x.type,
      updatedAt: x.updatedAt,
      createdAt: x._creationTime,
      data: { ...x.data }
    }
    return record
  })
  let updatedCursor = updatedRecordsRaw[updatedRecordsRaw.length - 1]?.updatedAt ?? cursor
  return {
    records: updatedRecords,
    syncCursor: updatedCursor.toString(),
  }
}

export const updateChatTitle = internalMutation({
  args: {
    chatId: v.id("records"),
    title: v.string()
  },
  handler: async (ctx, { chatId, title }) => {
    let chat = await ctx.db.get(chatId)
    if (!chat) throw new Error(`Chat ${chatId} not found`)
    await ctx.db.patch(chatId, {
      updatedAt: Date.now(),
      data: {
        ...chat.data,
        title
      }
    })
  }
})


const validate = {
  chat: (chat: RecordBase | null, userId: Id<"users">) => {
    let invalid = !chat ||
      chat.type !== "chats" ||
      chat.userId !== userId ||
      chat.deleted
    if (invalid) throw new Error(`Chat ${chat?._id} is invalid`)
    return chat as RecordWithChatData
  },
  message: (message: RecordBase | null, userId: Id<"users">, from?: "user" | "assistant") => {
    let invalid = !message ||
      message.type !== "messages" ||
      message.userId !== userId ||
      message.deleted ||
      (from && (message.data as Message).from !== from)
    if (invalid) throw new Error(`Message ${message?._id} is invalid`)
    return message as RecordWithMessageData
  },
}