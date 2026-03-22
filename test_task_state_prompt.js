import { Prompter } from './src/models/prompter.js';
import { TaskManager } from './src/agent/task_manager.js';

async function main() {
    const fakeAgent = {
        name: 'TestAgent',
        history: {
            memory: 'Test memory'
        },
        task_manager: null
    };

    fakeAgent.task_manager = new TaskManager(fakeAgent);
    fakeAgent.task_manager.createTask(
        'Collect 5 chickens and bring them back to base',
        [
            { description: 'Find chickens nearby' },
            { description: 'Collect 5 chickens' },
            { description: 'Return to base' }
        ]
    );

    const fakePrompterThis = {
        agent: fakeAgent
    };

    const inputPrompt = `
You are the agent.

Current memory:
$MEMORY

Current task state:
$TASK_STATE
`;

    const outputPrompt = await Prompter.prototype.replaceStrings.call(
        fakePrompterThis,
        inputPrompt,
        [],
        null,
        [],
        null
    );

    console.log('\n=== OUTPUT PROMPT ===\n');
    console.log(outputPrompt);

    const checks = {
        noLiteralPlaceholder: !outputPrompt.includes('$TASK_STATE'),
        hasGoal: outputPrompt.includes('Goal: Collect 5 chickens and bring them back to base'),
        hasTaskStatus: outputPrompt.includes('Task Status: in_progress'),
        hasCurrentStep: outputPrompt.includes('Current Step:'),
        hasStepText: outputPrompt.includes('Find chickens nearby')
    };

    console.log('\n=== CHECKS ===\n');
    console.log(checks);

    const allPassed = Object.values(checks).every(Boolean);
    if (!allPassed) {
        throw new Error('TASK_STATE prompt injection failed');
    }

    console.log('\nTEST PASSED');
}

main().catch(err => {
    console.error('\nTEST FAILED');
    console.error(err);
    process.exit(1);
});