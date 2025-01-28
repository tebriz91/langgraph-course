import {
    StateGraph,
    MessagesAnnotation,
    START,
    END,
    Annotation,
} from "@langchain/langgraph"

import {
    HumanMessage,
    SystemMessage,
    RemoveMessage,
    AIMessageChunk,
} from "@langchain/core/messages"
import { ChatOpenAI } from "@langchain/openai"
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite"
import pc from "picocolors"
import util from "util"

const StateAnnotation = Annotation.Root({
    ...MessagesAnnotation.spec,
    summary: Annotation<string>,
})

const llm = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
    streaming: true, // enable streaming
})

// define logic to call the model
async function callModel(state: typeof StateAnnotation.State) {
    // get summary if it exists
    const summary = state.summary || ""

    // if summary exists, add a system message with the summary
    if (summary) {
        // add summary to the system message
        const systemMessage = new SystemMessage(
            `Summary of conversation earlier: ${summary}`,
        )
        // add system message to the messages array
        const messages = [systemMessage, ...state.messages]

        const response = await llm.invoke(messages)
        return { messages: response }
    }

    // if summary does not exist, call the model with the messages
    const response = await llm.invoke(state.messages)
    return { messages: response }
}

// define a node to produce a summary
async function summarizeConversation(state: typeof StateAnnotation.State) {
    // get any existing summary
    const summary = state.summary || ""

    // create summarization prompt based on whether summary exists
    const summaryMessage = summary
        ? `This is summary of the conversation to date: ${summary}\n\n` +
          "Extend the summary by taking into account the new messages above:"
        : "Create a summary of the conversation above:"

    // add prompt to messages array
    const messages = [...state.messages, new HumanMessage(summaryMessage)]

    const response = await llm.invoke(messages)

    // delete all but 2 most recent messages
    const deleteMessages = state.messages
        .slice(0, -2)
        .map((m) => new RemoveMessage({ id: m.id ?? crypto.randomUUID() }))

    return {
        summary: response.content,
        messages: deleteMessages,
    }
}

// define conditional edge
// determine whether to end or summarize the conversation
function shouldContinue(state: typeof StateAnnotation.State) {
    const messages = state.messages

    // if there are more than 6 messages, then summarize, otherwise
    // return END
    return messages.length > 6 ? "summarize_conversation" : END
}

const checkpointer = SqliteSaver.fromConnString("./data/sqlite.db")

const graphBuilder = new StateGraph(StateAnnotation)

const graph = graphBuilder
    .addNode("conversation", callModel)
    .addNode("summarize_conversation", summarizeConversation)
    .addEdge(START, "conversation")
    .addConditionalEdges("conversation", shouldContinue)
    .addEdge("summarize_conversation", END)
    .compile({ checkpointer })

async function handleConversationTurn(message: string, config: any) {
    const inputMessage = new HumanMessage(message)
    console.log(pc.yellow(`Human: ${message}`))

    process.stdout.write(pc.blue("AI: ")) // start AI response line

    try {
        // initialize streaming process
        const stream = await graph.streamEvents(
            { messages: [inputMessage] },
            {
                ...config,
                version: "v2" as const, // API version
            },
        )

        // process stream events token by token
        for await (const event of stream) {
            if (!event) continue

            // handle streaming model output
            if (event.event === "on_chat_model_stream") {
                if (event.data?.chunk instanceof AIMessageChunk) {
                    const content = event.data.chunk.content
                    if (content) {
                        process.stdout.write(pc.blue(content))
                    }
                }
            }
        }
        console.log() // new line after response

        // get final state
        const finalState = await checkpointer.get(config)
        if (!finalState) {
            console.error("Failed to get final state")
            return
        }

        // access state values
        const stateValues = finalState.channel_values || {}

        // display summary if exists
        if (stateValues.summary) {
            console.log(pc.magenta(`Summary: ${stateValues.summary}`))
        }

        // display message count
        const messageCount = stateValues.messages?.length || 0
        console.log(
            pc.whiteBright(
                `Current number of messages in the state: ${messageCount}`,
            ),
        )

        return finalState
    } catch (error) {
        console.error(pc.red("Error during streaming:"), error)
        throw error
    }
}

async function simulateConversation() {
    // define a thread
    const config = { configurable: { thread_id: "1" } }

    // human messages
    const conversations = [
        "hi! I'm Lance",
        "what's my name?",
        "i like the 49ers!",
        "i like Nick Bosa, isn't he the highest paid defensive player?",
        "what's the weather like?",
        "Goodbye!",
        "who is the highest paid defensive player?",
        "do you remember my name?",
        "how to get to the 49ers stadium?",
        "oh, I forgot to ask, what's the weather like?",
    ]

    // loop through the conversation
    for (const message of conversations) {
        await handleConversationTurn(message, config)
    }

    // // show persisted state
    // console.log(pc.cyan("\n=== Persisted State ==="))
    // const persistedState = await checkpointer.get(config)
    // console.log(util.inspect(persistedState, { depth: null, colors: true }))
}

// run the simulation
await simulateConversation()
