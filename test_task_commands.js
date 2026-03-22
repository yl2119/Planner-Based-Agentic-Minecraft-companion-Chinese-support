import { TaskManager } from './src/agent/task_manager.js';

async function main() {
    const queriesModule = await import('./src/agent/commands/queries.js');
    const queryList = queriesModule.queryList;

    if (!Array.isArray(queryList)) {
        throw new Error('queryList is not available from queries.js');
    }

    function getCommand(name) {
        const cmd = queryList.find(c => c.name === name);
        if (!cmd) {
            throw new Error(`Command not found: ${name}`);
        }
        return cmd;
    }

    const fakeAgent = {
        name: 'TestAgent',
        task_manager: null
    };

    fakeAgent.task_manager = new TaskManager(fakeAgent);

    const showTask = getCommand('!showTask');
    const cancelTask = getCommand('!cancelTask');
    const clearTask = getCommand('!clearTask');

    console.log('\n=== TEST 1: !showTask with no task ===');
    console.log(showTask.perform(fakeAgent));

    fakeAgent.task_manager.createTask(
        'Collect 5 chickens and bring them back to base',
        [
            { description: 'Find chickens nearby' },
            { description: 'Collect 5 chickens' },
            { description: 'Return to base' }
        ]
    );

    console.log('\n=== TEST 2: !showTask with active task ===');
    console.log(showTask.perform(fakeAgent));

    console.log('\n=== TEST 3: !cancelTask ===');
    console.log(cancelTask.perform(fakeAgent));
    console.log(showTask.perform(fakeAgent));

    console.log('\n=== TEST 4: !clearTask ===');
    console.log(clearTask.perform(fakeAgent));
    console.log(showTask.perform(fakeAgent));

    console.log('\nTEST DONE');
}

main().catch(err => {
    console.error('\nTEST FAILED');
    console.error(err);
    process.exit(1);
});