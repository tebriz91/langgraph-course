import {
    Annotation,
    MemorySaver,
    NodeInterrupt,
    StateGraph,
} from "@langchain/langgraph"

const StateAnnotation = Annotation.Root({
    input: Annotation<string>,
})

const step1 = async (state: typeof StateAnnotation.State) => {
    console.log("---Step 1---")
    return state
}

const step2 = async (state: typeof StateAnnotation.State) => {
    // let's optionally raise a NodeInterrupt
    // if the length of the input is longer than 5 characters
    if (state.input?.length > 5) {
        throw new NodeInterrupt(
            `Received input that is longer than 5 characters: ${state.input}`,
        )
    }
    console.log("---Step 2---")
    return state
}

const step3 = async (state: typeof StateAnnotation.State) => {
    console.log("---Step 3---")
    return state
}

const checkpointer = new MemorySaver()

const graph = new StateGraph(StateAnnotation)
    .addNode("step1", step1)
    .addNode("step2", step2)
    .addNode("step3", step3)
    .addEdge("__start__", "step1")
    .addEdge("step1", "step2")
    .addEdge("step2", "step3")
    .addEdge("step3", "__end__")
    .compile({ checkpointer })

const initialInput = { input: "hello" }
const config = {
    configurable: {
        thread_id: "1",
    },
    streamMode: "values" as const,
}

const stream = await graph.stream(initialInput, config)

for await (const event of stream) {
    console.log(event)
}

const state = await graph.getState(config)
console.log(state.next)
console.log(state.tasks)

// let's try a longer input, this should trigger the dynamic interrupt
// we defined via raising a NodeInterrupt error inside the step2 node
const longInput = { input: "hello world" }
const config2 = {
    configurable: {
        thread_id: "2",
    },
    streamMode: "values" as const,
}

const streamWithInterrupt = await graph.stream(longInput, config2)

for await (const event of streamWithInterrupt) {
    console.log(event)
}

const state2 = await graph.getState(config2)
console.log(state2.next)
console.log(JSON.stringify(state2.tasks, null, 2))

// if we try to resume the graph from the breakpoint, we will
// simply interrupt again as our inputs & graph state haven't changed

// NOTE: to resume the graph from a dynamic interrupt we use the same syntax as
// regular interrupts -- we pass null as the input
const resumedStream = await graph.stream(null, config2)

for await (const event of resumedStream) {
    console.log(event)
}

const state3 = await graph.getState(config2)
console.log(state3.next)
console.log(JSON.stringify(state2.tasks, null, 2))

// if we want to resume the graph execution from the breakpoint,
// we can update the state to have an input that's shorter than 5 characters

// NOTE: this update will be applied as of the last successful node before the interrupt,
// i.e. `step1`, right before the node with an interrupt
await graph.updateState(config2, { input: "short" })

const updatedStream = await graph.stream(null, config2)

for await (const event of updatedStream) {
    console.log(event)
}

const state4 = await graph.getState(config2)
console.log(state4.next)
console.log(state4.values)
