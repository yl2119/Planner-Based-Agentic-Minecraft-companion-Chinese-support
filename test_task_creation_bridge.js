import { existsSync, readFileSync, rmSync } from 'fs';
import path from 'path';
import { TaskManager } from './src/agent/task_manager.js';
import { createTaskFromPlan } from './src/agent/library/skills.js';

function main() {
    const fakeAgent = { name: 'TestAgent' };
    fakeAgent.task_manager = new TaskManager(fakeAgent);

    const currentTaskPath = path.join('.', 'bots', fakeAgent.name, 'current_task.json');
    if (existsSync(currentTaskPath)) {
        rmSync(currentTaskPath, { force: true });
    }

    const fakePlanResult = {
        steps: [
            { description: 'Find chickens nearby' },
            { description: 'Collect 5 chickens' },
            { description: 'Return to base' }
        ]
    };

    const task = createTaskFromPlan(
        fakeAgent.task_manager,
        fakePlanResult,
        'Collect 5 chickens and bring them back to base',
        'chicken',
        5
    );

    const currentTask = fakeAgent.task_manager.getCurrentTask();

    if (!currentTask) {
        throw new Error('No current task after createTaskFromPlan');
    }

    if (!existsSync(currentTaskPath)) {
        throw new Error('current_task.json was not created');
    }

    const fileTask = JSON.parse(readFileSync(currentTaskPath, 'utf8'));

    const forbiddenFields = ['retry_count', 'last_failure_reason', 'last_attempt_at'];
    const badSteps = currentTask.steps.filter(step =>
        forbiddenFields.some(field => Object.prototype.hasOwnProperty.call(step, field))
    );

    console.log(JSON.stringify(currentTask, null, 2));

    if (task.task_id !== currentTask.task_id) {
        throw new Error('Returned task does not match current task');
    }

    if (fileTask.task_id !== currentTask.task_id) {
        throw new Error('Saved task does not match current task');
    }

    if (badSteps.length > 0) {
        throw new Error('Forbidden step fields still exist');
    }

    console.log('\nTEST PASSED');
}

main();