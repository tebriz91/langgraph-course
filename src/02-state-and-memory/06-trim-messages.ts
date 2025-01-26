import {
    StateGraph,
    MessagesAnnotation,
    START,
    END,
} from "@langchain/langgraph"

import {
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    trimMessages,
} from "@langchain/core/messages"
import { ChatOpenAI } from "@langchain/openai"
import pc from "picocolors"
import util from "util"

const initialMessages = [
    new SystemMessage({
        content: "This is a 4 token text. The full message is 10 tokens.",
        id: "1",
    }),
    new HumanMessage({
        content: "This is a 4 token text. The full message is 10 tokens.",
        id: "2",
    }),
    new AIMessage({
        content: "This is a 4 token text. The full message is 10 tokens.",
        id: "3",
    }),
    new HumanMessage({
        content: "This is a 4 token text. The full message is 10 tokens.",
        id: "4",
    }),
    new AIMessage({
        content: "This is a 4 token text. The full message is 10 tokens.",
        id: "5",
    }),
]

const llm = new ChatOpenAI({
    modelName: "gpt-3.5-turbo",
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
})

const tokenCounter = async (messages: BaseMessage[]): Promise<number> => {
    console.log(pc.cyan(`Counting tokens for ${messages.length} messages...`))
    const result = await llm.getNumTokensFromMessages(messages)
    console.log(pc.cyan(`Token count: ${result.totalCount}`))
    return result.totalCount
}

// Chat node that handles LLM interactions and trims messages
const chatModelNode = async (state: typeof MessagesAnnotation.State) => {
    const trimmedMessages = await trimMessages(state.messages, {
        maxTokens: 200,
        strategy: "last", // Trim from the last message
        tokenCounter,
        allowPartial: true,
        startOn: "ai", // Start on ai message
        endOn: "human", // End on human message
        includeSystem: true,
    })
    console.log(pc.yellow(`Final message count: ${trimmedMessages.length}`))

    const result = await llm.invoke(trimmedMessages)

    console.log(pc.greenBright("Trimmed messages passed to LLM:"))
    for (const message of trimmedMessages) {
        if (message instanceof AIMessage) {
            console.log(pc.blue(`AI: ${message.content}, ID: ${message.id}`))
        } else if (message instanceof HumanMessage) {
            console.log(
                pc.yellow(`Human: ${message.content}, ID: ${message.id}`),
            )
        } else if (message instanceof SystemMessage) {
            console.log(pc.red(`System: ${message.content} ID: ${message.id}`))
        }
    }

    return {
        messages: result,
    }
}

const graphBuilder = new StateGraph(MessagesAnnotation)

const graph = graphBuilder
    .addNode("chatModel", chatModelNode)
    .addEdge(START, "chatModel")
    .addEdge("chatModel", END)
    .compile()

const result = await graph.invoke({ messages: initialMessages })

// Log the last message
console.log(pc.greenBright("Final message. AI:"))
console.log(
    pc.blue(String(result.messages[result.messages.length - 1]?.content)),
)

// // Pretty print the whole result object
// function pprint(obj: any) {
//     console.log(
//         util.inspect(obj, {
//             depth: null,
//             colors: true,
//             breakLength: 80,
//         }),
//     )
// }

// pprint(result)
