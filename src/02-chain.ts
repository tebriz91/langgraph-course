import { AIMessage, HumanMessage } from "@langchain/core/messages"
import { ChatOpenAI } from "@langchain/openai"

const messages = [
    new AIMessage({
        content: "So you said you were researching ocean mammals?",
        name: "Model",
    }),
]

messages.push(
    new HumanMessage({
        content: "Yes, that's right.",
        name: "Lance",
    }),
)

messages.push(
    new AIMessage({
        content: "Great, what would you like to learn about.",
        name: "Model",
    }),
)

messages.push(
    new HumanMessage({
        content: "I want to learn about the best place to see Orcas in the US.",
        name: "Lance",
    }),
)

messages.forEach((m) => {
    console.log(`${m.name}: ${m.content}`)
})

const llm = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY,
})

// Process messages
async function processMessages() {
    const result = await llm.invoke(messages)
    console.log("Result type:", typeof result)
    console.log("Result:", result)
}

processMessages().catch(console.error)
