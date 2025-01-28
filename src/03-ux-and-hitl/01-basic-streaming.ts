import { ChatOpenAI } from "@langchain/openai"
import { StateGraph, MessagesAnnotation } from "@langchain/langgraph"
import { AIMessageChunk, HumanMessage } from "@langchain/core/messages"

// Initialize model with streaming
const model = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    streaming: true,
    temperature: 0,
})

// Model handler with streaming
async function callModel(state: typeof MessagesAnnotation.State) {
    const response = await model.invoke(state.messages)
    return { messages: [...state.messages, response] }
}

// Create workflow graph
const workflow = new StateGraph(MessagesAnnotation)
    .addNode("chat", callModel)
    .addEdge("__start__", "chat")
    .addEdge("chat", "__end__")

const app = workflow.compile()

// Stream handler
async function handleStream(message: string) {
    const config = {
        configurable: { thread_id: "1" },
        version: "v2" as const, // API version specification
    }

    const inputs = {
        messages: [new HumanMessage(message)],
    }

    try {
        // initialize streaming process
        const stream = await app.streamEvents(inputs, config)
        process.stdout.write("AI: ")

        // process stream events token by token
        for await (const event of stream) {
            if (!event) continue

            // handle streaming model output
            if (event.event === "on_chat_model_stream") {
                if (event.data?.chunk instanceof AIMessageChunk) {
                    const content = event.data.chunk.content
                    if (content) process.stdout.write(content)
                }
            }
        }
        console.log("\n")
    } catch (error) {
        console.error("Stream error:", error)
    }
}

// Example usage
async function main() {
    const messages = [
        "Hello! How are you?",
        "What's the weather like?",
        "Goodbye!",
    ]

    // process each message sequentially
    for (const msg of messages) {
        console.log("Human:", msg)
        await handleStream(msg)
    }
}

main().catch(console.error)
