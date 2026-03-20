import { TaskManager } from './src/agent/task_manager.js';

const fakeAgent = {
    name: 'Janet'
};

const taskManager = new TaskManager(fakeAgent);

console.log('\n=== TEST 1: createTask ===');
taskManager.createTask('Collect 5 chickens and bring them back to base', [
    { description: 'Find chickens nearby' },
    { description: 'Collect 5 chickens' },
    { description: 'Return to base' }
]);
console.log(taskManager.getCurrentTask());
console.log(taskManager.formatForPrompt());

console.log('\n=== TEST 2: complete step_1 ===');
taskManager.updateStepStatus('step_1', 'completed');
console.log(taskManager.getCurrentTask());
console.log(taskManager.formatForPrompt());

console.log('\n=== TEST 3: complete step_2 ===');
taskManager.updateStepStatus('step_2', 'completed');
console.log(taskManager.getCurrentTask());
console.log(taskManager.formatForPrompt());

console.log('\n=== TEST 4: complete step_3 ===');
taskManager.updateStepStatus('step_3', 'completed');
console.log(taskManager.getCurrentTask());
console.log(taskManager.formatForPrompt());

taskManager.recordStepFailure('step_1', 'No reachable cobblestone nearby');
console.log(taskManager.formatForPrompt());

taskManager.resetStepForRetry('step_1');
console.log(taskManager.formatForPrompt());

taskManager.blockStep('step_1', 'Need replanning');
console.log(taskManager.formatForPrompt());