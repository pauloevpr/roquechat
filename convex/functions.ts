import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { DataModel, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { ChatSchema, Message, MessageSchema, ModelConfigSchema, RecordType, RecordWithMessageData } from "./schema";
import { OpenAI } from "openai";
import { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ai, supportedModels } from "./llm";

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
    if (chatId) {
      let chat = await ctx.db.get(chatId)
      let invalidChat = !chat || chat.type !== "chats" || chat.userId !== userId
      if (invalidChat) throw new Error(`Chat ${chatId} not found`)
    } else {
      chatId = await ctx.db.insert("records", {
        type: "chats",
        updatedAt: now,
        deleted: false,
        data: {
          title: "",
        },
        userId
      })
    }
    let newMessage: Message = {
      chatId,
      content: message,
      streaming: false,
      streamId: undefined,
      from: "user",
    }
    await ctx.db.insert("records", {
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
        streaming: true,
        streamId,
        from: "assistant",
      },
      userId,
    })
    ctx.scheduler.runAfter(0, internal.functions.startStream, {
      streamId,
      chatId,
      responseMessageId,
      model,
    })
    return {
      chatId,
      message: { ...newMessage, id: responseMessageId }
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
      .withIndex("by_chatId", (q) => q.eq("data.chatId", chatId))
      .collect()
    return messages as RecordWithMessageData[]
  }
})


export const startStream = internalAction({
  args: {
    streamId: v.id("streams"),
    chatId: v.id("records"),
    responseMessageId: v.id("records"),
    model: v.object({
      name: v.string(),
      apiKey: v.string()
    })
  },
  handler: async (ctx, { streamId, chatId, responseMessageId, model }) => {
    console.log(`starting streaming with model ${model.name}`)
    let chatHistory = (
      await ctx.runQuery(internal.functions.getMessagesForChat, {
        chatId: chatId
      }))
      .sort((a, b) => a._creationTime - b._creationTime)
      .map(message => ({ role: message.data.from, content: message.data.content }))

    let chatTitle: string | undefined = undefined

    try {

      await ai.model(model.name, model.apiKey).stream(chatHistory, async (content) => {
        if (content) {
          await ctx.runMutation(internal.functions.appendStreamContent, {
            streamId,
            messageId: responseMessageId,
            content: content,
            final: false,
            chatId,
          })
        }
      })
      if (chatHistory.length <= 2) {
        let responseContent = await ctx.runQuery(internal.functions.getStreamContent, { streamId })
        chatTitle = await ai.model(model.name, model.apiKey).chat(
          [
            ...chatHistory,
            { role: "assistant", content: responseContent },
            { role: "user", content: "Based on our conversation, give me a short title (max 5 words) for this chat." }
          ],
        )
      }
      await ctx.runMutation(internal.functions.appendStreamContent, {
        streamId,
        messageId: responseMessageId,
        content: "",
        final: true,
        chatId,
        chatTitle
      })
    } catch (error) {
      await ctx.runMutation(internal.functions.appendStreamContent, {
        streamId,
        messageId: responseMessageId,
        content: `Failed: ${error}`,
        final: true,
        chatId,
      })
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
    chatId: v.id("records"),
    chatTitle: v.optional(v.string())
  },
  handler: async (ctx, { streamId, messageId, content, final, chatTitle, chatId }) => {
    let stream = await ctx.db.get(streamId)
    if (!stream) throw new Error(`Stream ${streamId} not found`)
    let newContent = [...stream.content, content]
    await ctx.db.patch(streamId, {
      content: newContent,
      finished: final,
      updatedAt: Date.now()
    })
    if (final) {
      let message = await ctx.db.get(messageId)
      if (!message) throw new Error(`Message ${messageId} not found`)
      let messageData = message.data as Message
      await ctx.db.patch(messageId, {
        updatedAt: Date.now(),
        data: {
          ...messageData,
          content: newContent.join(""),
          streaming: false,
          streamId: undefined,
        }
      })
      let chat = await ctx.db.get(chatId)
      if (!chat) throw new Error(`Chat ${chatId} not found`)
      if (chatTitle) {
        await ctx.db.patch(chatId, {
          updatedAt: Date.now(),
          data: {
            ...chat.data,
            title: chatTitle
          }
        })
      } else {
        await ctx.db.patch(chatId, {
          updatedAt: Date.now(),
        })
      }
      let deleteAfter = 2 * 60 * 60 * 1000 // 2 hours
      await ctx.scheduler.runAfter(deleteAfter, internal.functions.deleteStream, {
        streamId
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

