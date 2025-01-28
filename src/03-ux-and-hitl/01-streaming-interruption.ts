import {
    StateGraph,
    MessagesAnnotation,
    START,
    END,
    Annotation,
} from "@langchain/langgraph"

import {
    AIMessage,
    HumanMessage,
    SystemMessage,
    RemoveMessage,
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
    modelName: "gpt-4o",
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
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
    // convert user input into a HumanMessage object for the LLM
    const inputMessage = new HumanMessage(message)
    // display the user's message
    console.log(pc.yellow(`Human: ${message}`))

    // get the streamed response from the graph, using "values" mode to get chunks
    const stream = await graph.stream(
        { messages: [inputMessage] },
        { ...config, streamMode: "values" },
    )

    // initialize empty string to accumulate the streaming response
    let fullResponse = ""

    for await (const chunk of stream) {
        if (chunk.messages?.length > 0) {
            const lastMessage = chunk.messages[chunk.messages.length - 1]
            // check if the chunk contains an AI message
            if (lastMessage instanceof AIMessage) {
                const newContent = lastMessage.content
                // calculate what's new by slicing from the end of previous content
                const addition = String(newContent).slice(fullResponse.length)
                // display new content, without line breaks
                process.stdout.write(pc.blue(addition))
                // update full response with complete content so far
                fullResponse = String(newContent)
            }
        }
    }
    console.log() // new line after response

    // get the final state
    const finalState = await checkpointer.get(config)
    if (!finalState) {
        console.error("Failed to get final state")
        return
    }

    // access the state values using channel_values
    const stateValues = finalState.channel_values || {}

    // display summary if it exists
    if (stateValues.summary) {
        console.log(pc.magenta(`Summary: ${stateValues.summary}`))
    }

    // display correct message count
    const messageCount = stateValues.messages?.length || 0
    console.log(
        pc.whiteBright(
            `Current number of messages in the state: ${messageCount}`,
        ),
    )

    return finalState
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
