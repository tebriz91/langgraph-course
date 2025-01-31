import { ChatOpenAI } from "@langchain/openai"
import { tool } from "@langchain/core/tools"
import {
    StateGraph,
    START,
    END,
    Annotation,
    MemorySaver,
    NodeInterrupt,
} from "@langchain/langgraph"
import { ToolNode } from "@langchain/langgraph/prebuilt"
import {
    BaseMessage,
    AIMessage,
    HumanMessage,
    SystemMessage,
} from "@langchain/core/messages"
import { z } from "zod"
import pc from "picocolors"
import readline from "readline"

// setup readline interface for terminal interaction
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
})

// convert readline.question into a Promise-based function for async/await usage
const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
        rl.question(query, resolve)
    })
}

// define the state management for the graph
// this keeps track of all messages in the conversation
const AgentState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: (x, y) => x.concat(y), // combine old and new messages
    }),
})

// define calculator tools with Zod schema validation
const addTool = tool(
    async ({ a, b }: { a: number; b: number }) => {
        return (a + b).toString()
    },
    {
        name: "add",
        description: "Adds two numbers.",
        schema: z.object({
            a: z.number().describe("The first number."),
            b: z.number().describe("The second number."),
        }),
    },
)

const multiplyTool = tool(
    async ({ a, b }: { a: number; b: number }) => {
        // check for potentially expensive calculations
        const result = a * b
        if (result > Number.MAX_SAFE_INTEGER) {
            throw new NodeInterrupt(
                "Result would be too large for safe integer operations.",
            )
        }
        return result.toString()
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
        // check for division by zero
        if (b === 0) {
            throw new NodeInterrupt(
                "Cannot divide by zero. Operation halted for safety.",
            )
        }
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

const tools = [addTool, multiplyTool, divideTool, subtractTool]
// create a ToolNode that can execute these tools
const toolNode = new ToolNode<typeof AgentState.State>(tools)

const model = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
})
// bind the tools to the model so it knows what tools are available
const modelWithTools = model.bindTools(tools)

// decision function to determine if we should continue processing or end
function shouldContinue(state: typeof AgentState.State): "action" | typeof END {
    const lastMessage = state.messages[state.messages.length - 1]
    // if the last message doesn't contain tool calls, we're done
    if (lastMessage && !(lastMessage as AIMessage).tool_calls?.length) {
        return END
    }
    // otherwise, continue to the action node
    return "action"
}

// function to process messages through the model
async function callModel(
    state: typeof AgentState.State,
): Promise<Partial<typeof AgentState.State>> {
    // add system message to guide the model's behavior
    const systemMessage = new SystemMessage(
        "You are helpful assistant tasked with performing math operations.",
    )
    const messages = [systemMessage, ...state.messages]
    const response = await modelWithTools.invoke(messages)
    return { messages: [response] }
}

const workflow = new StateGraph(AgentState)
    .addNode("agent", callModel)
    .addNode("action", toolNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldContinue)
    .addEdge("action", "agent")

const checkpointer = new MemorySaver()

const app = workflow.compile({
    checkpointer,
    interruptBefore: ["action"], // interrupt before the action node
})

// main workflow execution function
async function runWorkflow() {
    const config = {
        configurable: { thread_id: "1" },
        streamMode: "values" as const,
    }

    // track last calculation result and session state
    let lastResult: string | undefined
    let continueSession = true

    // main interaction loop
    while (continueSession) {
        // display previous result if it exists
        if (lastResult) {
            console.log(pc.magenta("\nLast result: " + lastResult))
        }

        // get user's math operation input
        const userInput = await question(
            pc.yellow(
                "\nEnter your math operation (e.g., 'Add 3 to 4') or 'exit' to quit: ",
            ),
        )

        // check for exit command
        if (userInput.toLowerCase() === "exit") {
            continueSession = false
            break
        }

        // create message from user input
        const inputs = new HumanMessage(userInput)
        // console.log(pc.yellow(`\nHuman: ${inputs.content}`))

        // first phase: run until interruption (before action)
        for await (const event of await app.stream(
            { messages: [inputs] },
            config,
        )) {
            const recentMsg = event.messages[event.messages.length - 1]
            console.log(pc.blue(recentMsg.content))
        }

        // get current state to show pending action
        const currentState = await checkpointer.get(config)
        if (currentState && "channel_values" in currentState) {
            const messages = (
                currentState.channel_values as { messages: BaseMessage[] }
            ).messages
            const lastMessage = messages[messages.length - 1] as AIMessage
            const pendingAction = lastMessage.tool_calls?.[0]

            // display the pending action details
            if (pendingAction) {
                console.log(pc.cyan("\n=== Pending Action ==="))
                console.log(pc.cyan(`Tool: ${pendingAction.name}`))
                console.log(
                    pc.cyan(
                        `Arguments: ${JSON.stringify(
                            pendingAction.args,
                            null,
                            2,
                        )}`,
                    ),
                )
            }
        }

        // get user confirmation for action
        const answer = await question(
            pc.green("\nContinue with the action? (y/n): "),
        )

        // process based on user's confirmation
        if (answer.toLowerCase() === "y") {
            console.log(pc.green("\n=== Continuing after interruption ==="))

            // second phase: continue after user approval
            for await (const event of await app.stream(null, config)) {
                const recentMsg = event.messages[event.messages.length - 1]
                console.log(pc.blue(recentMsg.content))
                lastResult = recentMsg.content as string
            }
        } else {
            console.log(pc.yellow("\nAction cancelled by user"))
        }

        // // ask if user wants to continue with another calculation
        // const continueAnswer = await question(
        //     pc.magenta(
        //         "\nWould you like to perform another calculation? (y/n): ",
        //     ),
        // )
        // continueSession = continueAnswer.toLowerCase() === "y"
    }

    console.log(pc.green("\nThank you for using the calculator!"))
    // cleanup: close readline interface
    rl.close()
}

// start the workflow with error handling
runWorkflow().catch((error) => {
    console.error(pc.red("Error during graph execution:"), error)
    rl.close()
})
