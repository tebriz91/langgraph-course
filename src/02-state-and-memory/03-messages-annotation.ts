import {
    StateGraph,
    MessagesAnnotation, // Prebuilt state annotation that combines returned messages
    START,
    END,
} from "@langchain/langgraph"

import { AIMessage, HumanMessage } from "@langchain/core/messages"
import { ChatOpenAI } from "@langchain/openai"
import { tool } from "@langchain/core/tools"
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt"
import { z } from "zod"

// To add additional values to the pre-build state uncomment bellow:
// const StateAnnotation = Annotation.Root({
//     ...MessagesAnnotation.spec,
//     myValue1: Annotation<string>,
//     myValue2: Annotation<boolean>,
//   });

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

const tools = [multiplyTool]

const llmWithTools = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
}).bindTools(tools)

const llmNodeWithTools = async (state: typeof MessagesAnnotation.State) => ({
    messages: new AIMessage(await llmWithTools.invoke(state.messages)),
})

const toolNodeForGraph = new ToolNode(tools)

const graphBuilder = new StateGraph(MessagesAnnotation) // Here we use pre-build state annotation

const graph = graphBuilder
    .addNode("llm", llmNodeWithTools)
    .addNode("tools", toolNodeForGraph)
    .addEdge(START, "llm")
    .addConditionalEdges("llm", toolsCondition)
    .addEdge("tools", END)
    .compile()

const result = await graph.invoke({
    messages: [new HumanMessage("Hello?")],
})

console.log(result)
