import { StateGraph, Annotation } from "@langchain/langgraph"

const StateAnnotation = Annotation.Root({
    graphState: Annotation<string>(),
})

function node1(state: typeof StateAnnotation.State) {
    console.log("---Node 1---")
    return { graphState: `${state.graphState} I am` }
}

function node2(state: typeof StateAnnotation.State) {
    console.log("---Node 2---")
    return { graphState: `${state.graphState} happy!` }
}

function node3(state: typeof StateAnnotation.State) {
    console.log("---Node 3---")
    return { graphState: `${state.graphState} sad!` }
}

// Determines the next node to transition to based on a random condition
function decideMood(state: typeof StateAnnotation.State): "node2" | "node3" {
    return Math.random() < 0.5 ? "node2" : "node3"
}

// Builds and compiles the workflow graph
const graphBuilder = new StateGraph(StateAnnotation)

const graph = graphBuilder
    .addNode("node1", node1)
    .addNode("node2", node2)
    .addNode("node3", node3)
    .addEdge("__start__", "node1")
    .addConditionalEdges("node1", decideMood)
    .addEdge("node2", "__end__")
    .addEdge("node3", "__end__")
    .compile()

//Invokes the workflow graph with the initial state
const finalState = await graph.invoke({ graphState: "Hi, this is Lance." })

console.log(JSON.stringify(finalState))
