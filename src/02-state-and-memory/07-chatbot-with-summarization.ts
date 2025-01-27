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
    BaseMessage,
} from "@langchain/core/messages"
import { ChatOpenAI } from "@langchain/openai"
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite"
import pc from "picocolors"
import util from "util"

// add additional key "summary" to the pre-build state:
const StateAnnotation = Annotation.Root({
    ...MessagesAnnotation.spec,
    summary: Annotation<string>,
})

// define llm node:
const llm = new ChatOpenAI({
    modelName: "gpt-4o-mini",
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

// add memory
const checkpointer = SqliteSaver.fromConnString("./data/sqlite.db")

// initialize the graph builder
const graphBuilder = new StateGraph(StateAnnotation)

// build the graph
const graph = graphBuilder
    .addNode("conversation", callModel)
    .addNode("summarize_conversation", summarizeConversation)
    .addEdge(START, "conversation")
    .addConditionalEdges("conversation", shouldContinue)
    .addEdge("summarize_conversation", END)
    .compile({ checkpointer })

async function handleConversationTurn(message: string, config: any) {
    const inputMessage = new HumanMessage(message)
    const output = await graph.invoke({ messages: [inputMessage] }, config)
    // print human message
    console.log(pc.yellow(`Human: ${message}`))
    // print last message (from AI)
    printLastMessage(output.messages)
    // print summary if it exists
    if (output.summary) {
        console.log(pc.magenta(`Summary: ${output.summary}`))
    }
    // print current number of messages in the state
    console.log(
        pc.whiteBright(
            `Current number of messages in the state: ${output.messages.length}`,
        ),
    )
    return output
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

    // Show persisted state
    console.log(pc.cyan("\n=== Persisted State ==="))
    const persistedState = await checkpointer.get(config)
    console.log(util.inspect(persistedState, { depth: null, colors: true }))
}
function printLastMessage(messages: BaseMessage[]) {
    const lastMessage = messages[messages.length - 1]
    if (lastMessage instanceof AIMessage) {
        console.log(pc.blue(`AI: ${lastMessage.content}`))
    } else if (lastMessage instanceof SystemMessage) {
        console.log(pc.green(`System: ${lastMessage.content}`))
    } else if (lastMessage instanceof HumanMessage) {
        console.log(pc.yellow(`Human: ${lastMessage.content}`))
    }
}

// Run the simulation
await simulateConversation()
