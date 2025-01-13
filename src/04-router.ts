import { BaseMessage, AIMessage, HumanMessage } from "@langchain/core/messages"
import { ChatOpenAI } from "@langchain/openai"
import { StateGraph, Annotation, START, END } from "@langchain/langgraph"
import { tool } from "@langchain/core/tools"
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt"
import { z } from "zod"

// Define the shape of our graph's state
// The state contains a "messages" array that can be updated with new messages
const StateAnnotation = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        // Reducer combines existing messages with new ones
        // Can handle both single messages and arrays of messages
        reducer: (left: BaseMessage[], right: BaseMessage | BaseMessage[]) => {
            if (Array.isArray(right)) {
                return left.concat(right)
            }
            return left.concat([right])
        },
        // Initialize with empty array
        default: () => [],
    }),
})

// Define a multiplication tool with input validation
const multiplyTool = tool(
    // Tool implementation
    async ({ a, b }: { a: number; b: number }) => {
        return (a * b).toString()
    },
    // Tool metadata and schema
    {
        name: "multiply",
        description: "Multiplies two numbers.",
        // Zod schema ensures type safety at runtime
        schema: z.object({
            a: z.number().describe("The first number."),
            b: z.number().describe("The second number."),
        }),
    },
)

// Array of available tools
const tools = [multiplyTool]

// Initialize ChatOpenAI with tool binding
// This allows the LLM to understand and use the tools
const llmWithTools = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
}).bindTools(tools)

// Node that handles LLM interactions and tool calls
const llmNodeWithTools = async (state: typeof StateAnnotation.State) => ({
    messages: new AIMessage(await llmWithTools.invoke(state.messages)),
})

// Create a tool node that can execute the defined tools
const toolNodeForGraph = new ToolNode(tools)

// Initialize the graph builder with our state definition
const graphBuilder = new StateGraph(StateAnnotation)

// Build the graph
const graph = graphBuilder
    .addNode("llm", llmNodeWithTools)
    .addNode("tools", toolNodeForGraph)
    .addEdge(START, "llm")
    .addConditionalEdges("llm", toolsCondition) // LLM can transition to tools or END
    .addEdge("tools", END)
    .compile()

// Test the graph with a conversation
const result = await graph.invoke({
    messages: [new HumanMessage("Hello?")],
})

console.log(result)
