import { StateGraph, Annotation, START, END } from "@langchain/langgraph"

const inputState = Annotation.Root({
    question: Annotation<string>(),
})

const outputState = Annotation.Root({
    answer: Annotation<string>(),
})

// Overall state combining the question, answer, and notes
const overallState = Annotation.Root({
    question: Annotation<string>(),
    answer: Annotation<string>(),
    notes: Annotation<string>(), // Additional notes to be included in the process
})

// Define the 'thinkingNode' that processes the 'inputState' and generates a result
const thinkingNode = (state: typeof inputState) => {
    // Log the state before processing in the thinkingNode
    console.log("Before Thinking Node - inputState: ", state)

    // Simulate processing and return a new overallState with answer and notes
    const result = {
        answer: "bye",
        notes: "... his name is Lance",
    }

    // Log the new overallState after processing in the thinkingNode
    console.log("After Thinking Node - overallState: ", result)
    return result // Return the newly created overallState
}

// Define the 'answerNode' that processes the 'overallState' and generates the final result
const answerNode = (state: typeof overallState) => {
    console.log("Before Answer Node - overallState: ", state)

    const result = {
        answer: "bye Lance",
    }

    console.log("After Answer Node - overallState: ", result)
    return result
}

// Build the graph with input and output states
const graphBuilder = new StateGraph({
    input: inputState,
    output: outputState,
})

const graph = graphBuilder
    .addNode("thinking_node", thinkingNode)
    .addNode("answer_node", answerNode)

    .addEdge(START, "thinking_node")
    .addEdge("thinking_node", "answer_node")
    .addEdge("answer_node", END)
    .compile()

const main = async () => {
    const result = await graph.invoke({
        question: "What is your name?",
    })
    console.log("Final Result: ", JSON.stringify(result))
}

main()
