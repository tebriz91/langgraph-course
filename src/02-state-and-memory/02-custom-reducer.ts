import { StateGraph, Annotation, START, END } from "@langchain/langgraph"

const customReducer = () => {
    return (prevState: number[], newState: number[]) => {
        console.log("Reducer - Prev State:", prevState) // Log previous state
        console.log("Reducer - New State:", newState) // Log new state

        // Custom logic: Merge previous state and new state without duplicates
        const mergedState = [...new Set([...prevState, ...newState])]

        console.log("Reducer - Merged State:", mergedState) // Log merged state
        return mergedState
    }
}

const StateAnnotation = Annotation.Root({
    foo: Annotation<number[]>({
        reducer: customReducer(),
        default: () => [],
    }),
})

const node1 = async (state: typeof StateAnnotation.State) => {
    console.log("---Node 1---")
    const lastElement = state.foo[state.foo.length - 1] || 0 // Handle case where array might be empty
    return { foo: [...state.foo, lastElement + 1] }
}

const node2 = async (state: typeof StateAnnotation.State) => {
    console.log("---Node 2---")
    const lastElement = state.foo[state.foo.length - 1] || 0
    return { foo: [...state.foo, lastElement - 1] } // Subtract 1 to show how customReducer works
}

const node3 = async (state: typeof StateAnnotation.State) => {
    console.log("---Node 3---")
    const lastElement = state.foo[state.foo.length - 1] || 0
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
