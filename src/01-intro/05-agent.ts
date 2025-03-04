import {
    BaseMessage,
    SystemMessage,
    AIMessage,
    HumanMessage,
    ToolMessage,
} from "@langchain/core/messages"
import { ChatOpenAI } from "@langchain/openai"
import {
    StateGraph,
    Annotation,
    messagesStateReducer,
    START,
    END,
} from "@langchain/langgraph"
import { tool } from "@langchain/core/tools"
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt"
import { z } from "zod"
import pc from "picocolors"
import util from "util"

// Define the shape of our graph's state
// The state contains a "messages" array that can be updated with new messages
const StateAnnotation = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: messagesStateReducer,
        default: () => [],
    }),
})

// Define an add tool with input validation
const addTool = tool(
    // Tool implementation
    async ({ a, b }: { a: number; b: number }) => {
        return (a + b).toString()
    },
    // Tool metadata and schema
    {
        name: "add",
        description: "Adds two numbers.",
        // Zod schema ensures type safety at runtime
        schema: z.object({
            a: z.number().describe("The first number."),
            b: z.number().describe("The second number."),
        }),
    },
)

const multiplyTool = tool(
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

const divideTool = tool(
    async ({ a, b }: { a: number; b: number }) => {
        return (a / b).toString()
    },
    {
        name: "divide",
        description: "Divides two numbers.",
        schema: z.object({
            a: z.number().describe("The first number."),
            b: z.number().describe("The second number."),
        }),
    },
)

const subtractTool = tool(
    async ({ a, b }: { a: number; b: number }) => {
        return (a - b).toString()
    },
    {
        name: "subtract",
        description: "Subtracts two numbers.",
        schema: z.object({
            a: z.number().describe("The first number."),
            b: z.number().describe("The second number."),
        }),
    },
)

// Array of available tools
const tools = [addTool, multiplyTool, divideTool, subtractTool]

// Initialize ChatOpenAI with tool binding
const llm = new ChatOpenAI({
    modelName: "gpt-4o",
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
}).bindTools(tools)

// System message
const systemMessage = new SystemMessage(
    "You are helpful assistant tasked with performing math operations.",
)

// Initialize an assistant node that handles LLM interactions and tool calls
const assistantNode = async (state: typeof StateAnnotation.State) => {
    // Call the model with the existing messages and prepend a system message to them
    const result = await llm.invoke([systemMessage, ...state.messages])
    // Return the result as an AIMessage instance (with metadata)
    return {
        messages: result,
    }
}

// Create a tool node that can execute the defined tools
const toolNode = new ToolNode(tools)

// Initialize the graph builder with our state definition
const graphBuilder = new StateGraph(StateAnnotation)

// Build the graph
const graph = graphBuilder
    .addNode("assistant", assistantNode)
    .addNode("tools", toolNode)
    .addEdge(START, "assistant")
    .addConditionalEdges("assistant", toolsCondition) // Assistant can transition to tools or END
    .addEdge("tools", "assistant") // Tools always transition back to assistant
    .compile()

// Test the graph with a conversation
const result = await graph.invoke({
    messages: [
        new HumanMessage(
            "Add 3 and 4. Multiply the output by 2. Then divide the output by 3. Then subtract 1 from the output.",
        ),
    ],
})

// Loop all messages and print them using picocolors with different colors
result.messages.forEach((m) => {
    if (m instanceof AIMessage) {
        console.log(pc.blue(`AI: ${m.content}`))
    }
    if (m instanceof HumanMessage) {
        console.log(pc.yellow(`Human: ${m.content}`))
    }
    if (m instanceof ToolMessage) {
        console.log(pc.cyan(`Tool: ${m.name}. Result: ${m.content}`))
    }
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
