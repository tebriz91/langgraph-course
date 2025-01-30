import { entrypoint, task, getPreviousState } from "@langchain/langgraph"

import {
    HumanMessage,
    SystemMessage,
    AIMessageChunk,
    BaseMessage,
} from "@langchain/core/messages"
import { ChatOpenAI } from "@langchain/openai"
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite"
import pc from "picocolors"
import util from "util"

interface ChatInput {
    message: string
}

interface ChatState {
    messages: BaseMessage[]
    summary: string
}

const checkpointer = SqliteSaver.fromConnString("./data/sqlite.db")
const llm = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
    streaming: true, // enable streaming
})

// Task 1: Generate AI Response
const generateResponse = task(
    "generateResponse",
    async (messages: BaseMessage[], summary?: string) => {
        if (summary) {
            // add summary to the system message
            const systemMessage = new SystemMessage(
                `Summary of conversation earlier: ${summary}`,
            )
            // add system message to the messages array
            messages = [systemMessage, ...messages]
        }
        // if summary does not exist, just call the model with the messages
        const response = await llm.invoke(messages)
        return response
    },
)

// Task 2: Summarize Conversation
const summarizeChat = task(
    "summarizeChat",
    async (
        messages: BaseMessage[],
        oldSummary?: string,
    ): Promise<{
        summary: string
        messages: BaseMessage[]
    }> => {
        const summaryMessage = oldSummary
            ? `This is summary of the conversation to date: ${oldSummary}\n\n` +
              "Extend the summary by taking into account the new messages above:"
            : "Create a summary of the conversation above:"

        const allMessages = [...messages, new HumanMessage(summaryMessage)]
        const response = await llm.invoke(allMessages)
        const summaryContent = String(response.content)

        // keep only the 2 most recent messages instead of marking for removal
        const keptMessages = messages.slice(-2)

        return {
            summary: summaryContent,
            messages: keptMessages,
        }
    },
)

// Main Workflow
const chatWorkflow = entrypoint(
    {
        name: "chatWorkflow",
        checkpointer,
    },
    async (input: ChatInput) => {
        // get previous saved state from the last invocation of the current thread
        const previous = getPreviousState<ChatState>()

        // initialize with default values if previous state is undefined
        const messages = previous?.messages ?? []
        const summary = previous?.summary ?? ""

        // add new message and generate response
        messages.push(new HumanMessage(input.message))

        // generate AI response
        const response = await generateResponse(messages, summary)
        messages.push(response)

        // check if summarization is needed (more than 6 messages)
        let newState = { messages, summary }
        if (messages.length > 6) {
            const { summary: newSummary, messages: trimmedMessages } =
                await summarizeChat(messages, summary)
            newState = {
                messages: trimmedMessages,
                summary: newSummary,
            }
        }

        return entrypoint.final({
            value: newState,
            save: newState,
        })
    },
)

async function runChat() {
    const config = { configurable: { thread_id: "1" } }

    const messages = [
        "hi! I'm Lance",
        "what's my name?",
        "i like the 49ers!",
        "i like Nick Bosa, isn't he the highest paid defensive player?",
        "what's the weather like?",
        // "Goodbye!",
        // "who is the highest paid defensive player?",
        // "do you remember my name?",
        // "how to get to the 49ers stadium?",
        // "oh, I forgot to ask, what's the weather like?",
    ]

    for (const message of messages) {
        // initialize streaming process
        const stream = await chatWorkflow.streamEvents(
            { message },
            { version: "v2", streamMode: "updates", ...config },
        )
        console.log(pc.yellow(`Human: ${message}`))

        process.stdout.write(pc.blue("AI: "))

        // process stream events token by token
        for await (const event of stream) {
            if (!event) continue
            if (event.event === "on_chat_model_stream") {
                if (event.data?.chunk instanceof AIMessageChunk) {
                    const content = event.data.chunk.content
                    if (content) {
                        // convert content to string if it's complex
                        const textContent =
                            typeof content === "string"
                                ? content
                                : JSON.stringify(content)
                        process.stdout.write(pc.blue(textContent))
                    }
                }
            }
        }
        console.log()

        // access state values
        const state = await checkpointer.get(config)
        if (!state) {
            console.error("Failed to get final state")
            return
        }

        const stateValues = state.channel_values?.__end__ ?? {}

        // print current number of messages
        console.log(
            pc.whiteBright(
                `Number of messages: ${
                    stateValues.messages ? stateValues.messages.length : 0
                }`,
            ),
        )

        // print summary
        console.log(
            pc.magenta(
                `Summary: ${
                    stateValues.summary
                        ? stateValues.summary
                        : "No summary available"
                }`,
            ),
        )
    }
    // show persisted state
    console.log(pc.cyan("\n=== Persisted State ==="))
    const persistedState = await checkpointer.get(config)
    console.log(util.inspect(persistedState, { depth: null, colors: true }))
}

runChat().catch(console.error)
