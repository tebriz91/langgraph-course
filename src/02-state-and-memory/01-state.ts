import { BaseMessage } from "@langchain/core/messages"
import {
    StateGraph,
    Annotation,
    messagesStateReducer,
    START,
    END,
} from "@langchain/langgraph"

const StateAnnotation = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: messagesStateReducer,
        default: () => [],
    }),
    questions: Annotation<string[]>({
        // reducer: - Function that determines how
        // new values are combined with existing ones
        // Uses nullish coalescing ?? to pick and return
        // first non-null value
        // y - new value, x - existing value
        // reducer(x, y) returns y if y is not null or undefined
        reducer: (x, y) => y ?? x ?? "",
        default: () => [],
    }),
    answers: Annotation<string[]>({
        // Uses spread operator to combine arrays
        // reducer(x, y) returns a new array containing
        // all elements from x and y
        reducer: (x, y) => {
            console.log("Reducer invoked with:", { existing: x, new: y })
            return [...(x ?? []), ...(y ?? [])]
        },
        default: () => [],
    }),
})

const node1 = async (state: typeof StateAnnotation.State) => {
    console.log("---Node 1---")
    return state
}

const node2 = async (state: typeof StateAnnotation.State) => {
    console.log("---Node 2---")
    return state
}

const graphBuilder = new StateGraph(StateAnnotation)

const graph = graphBuilder
    // .addNode("question", node1)
    .addNode("answer", node2)
    // .addEdge(START, "question")
    .addEdge(START, "answer")
    .addEdge("answer", END)
    .compile()

// // Main execution
const main = async () => {
    const result = await graph.invoke({
        answers: ["I am Bob."],
    })
    console.log(JSON.stringify(result))
}

main()
