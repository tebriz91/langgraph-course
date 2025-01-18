import { StateGraph, Annotation, START, END } from "@langchain/langgraph"

const StateAnnotation = Annotation.Root({
    foo: Annotation<number[]>({
        // Reducer that ensures state is updated correctly
        reducer: (x, y) => y, // Override the state with the new value
        default: () => [],
    }),
})

const node1 = async (state: typeof StateAnnotation.State) => {
    console.log("---Node 1---")
    const lastElement = state.foo[state.foo.length - 1]
    return { foo: [...state.foo, lastElement + 1] }
}

const node2 = async (state: typeof StateAnnotation.State) => {
    console.log("---Node 2---")
    const lastElement = state.foo[state.foo.length - 1]
    return { foo: [...state.foo, lastElement + 1] }
}

const node3 = async (state: typeof StateAnnotation.State) => {
    console.log("---Node 3---")
    const lastElement = state.foo[state.foo.length - 1]
    return { foo: [...state.foo, lastElement + 1] }
}

const graphBuilder = new StateGraph(StateAnnotation)

const graph = graphBuilder
    .addNode("node1", node1)
    .addNode("node2", node2)
    .addNode("node3", node3)
    .addEdge(START, "node1")
    .addEdge("node1", "node2")
    .addEdge("node2", "node3")
    .addEdge("node2", END)
    .addEdge("node3", END)
    .compile()

const main = async () => {
    const result = await graph.invoke({ foo: [0] })
    console.log(JSON.stringify(result))
}

main()
