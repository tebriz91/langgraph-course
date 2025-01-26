import {
    StateGraph,
    MessagesAnnotation,
    START,
    END,
} from "@langchain/langgraph"

import {
    AIMessage,
    HumanMessage,
    RemoveMessage,
} from "@langchain/core/messages"
import { ChatOpenAI } from "@langchain/openai"
import util from "util"

const messages = [
    new AIMessage({
        id: "1",
        content: "Hi!",
        name: "Bot",
    }),
]

messages.push(
    new HumanMessage({
        id: "2",
        content: "Hello!",
        name: "Lance",
    }),
)

messages.push(
    new AIMessage({
        id: "3",
        content: "So you said you were researching ocean mammals?",
        name: "Bot",
    }),
)

messages.push(
    new HumanMessage({
        id: "4",
        content:
            "Yes, I know about whales. But what others should I learn about?",
        name: "Lance",
    }),
)

const llm = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
})

// Filter Messages Node
const filterMessagesNode = async (state: typeof MessagesAnnotation.State) => {
    // Delete all but the 2 most recent messages
    const deleteMessages = state.messages
        .slice(0, -2)
        .map((m) => new RemoveMessage({ id: m.id ?? crypto.randomUUID() }))

    return { messages: deleteMessages }
}

// Chat node that handles LLM interactions
const chatModelNode = async (state: typeof MessagesAnnotation.State) => {
    console.log("chatModelNode")
    const result = await llm.invoke(state.messages)
    return {
        messages: result,
    }
}

// Instead of filtering messages, we can also just invoke the LLM
// with a subset of the messages
// const result = await llm.invoke(state.messages.slice(-2))

const graphBuilder = new StateGraph(MessagesAnnotation)

const graph = graphBuilder
    .addNode("filterMessages", filterMessagesNode)
    .addNode("chatModel", chatModelNode)
    .addEdge(START, "filterMessages")
    .addEdge("filterMessages", "chatModel")
    .addEdge("chatModel", END)
    .compile()

const result = await graph.invoke({
    messages: messages,
})

// Pretty print the whole result object
function pprint(obj: any) {
    console.log(
        util.inspect(obj, {
            depth: null,
            colors: true,
            breakLength: 80,
        }),
    )
}

pprint(result)
