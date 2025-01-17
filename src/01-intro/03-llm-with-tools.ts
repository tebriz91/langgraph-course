import { ChatOpenAI } from "@langchain/openai"
import { HumanMessage } from "@langchain/core/messages"
import { tool } from "@langchain/core/tools"
import { z } from "zod"

export const llm = new ChatOpenAI({
    modelName: "gpt-4",
    temperature: 0,
})

// Define tool using zod schema
export const multiplyTool = tool(
    async ({ a, b }: { a: number; b: number }) => {
        return (a * b).toString()
    },
    {
        name: "multiply",
        description: "Multiplies two numbers.",
        schema: z.object({
            a: z.number().describe("The first number."),
            b: z.number().describe("The second number."),
        }),
    },
)

// Bind tool to LLM
const llmWithTools = llm.bindTools([multiplyTool])

const result = await llmWithTools.invoke([
    new HumanMessage({
        content: "What is 5 times 5?",
        name: "Lance",
    }),
])

// Show tool calls
console.log(result.tool_calls)
