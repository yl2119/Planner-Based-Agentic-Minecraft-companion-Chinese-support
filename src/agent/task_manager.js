import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import path from 'path';

const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'failed', 'cancelled'];
const STEP_STATUSES = ['pending', 'in_progress', 'completed', 'failed', 'blocked'];
const TASK_INDEX_FILE = 'index.json';

export class TaskManager {
    constructor(agent) {
        this.agent = agent;
        this.currentTask = null;
        this.taskQueue = [];
    }

    getTasksDir() {
        return path.join('.', 'bots', this.agent.name, 'tasks');
    }

    ensureTasksDir() {
        const tasksDir = this.getTasksDir();
        if (!existsSync(tasksDir)) {
            mkdirSync(tasksDir, { recursive: true });
        }
        return tasksDir;
    }

    getTaskFilePath(task = this.currentTask) {
        if (!task || !task.task_id) {
            throw new Error('task must have a task_id');
        }
        return path.join(this.getTasksDir(), `${task.task_id}.json`);
    }

    getTaskIndexPath() {
        return path.join(this.getTasksDir(), TASK_INDEX_FILE);
    }

    nowIso() {
        return new Date().toISOString();
    }

    generateTaskId() {
        return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    generateStepId(index) {
        return `step_${index + 1}`;
    }

    touchTask(task = this.currentTask) {
        if (task) {
            task.updated_at = this.nowIso();
        }
    }

    validateGoal(goal) {
        if (typeof goal !== 'string' || goal.trim().length === 0) {
            throw new Error('goal must be a non-empty string');
        }
    }

    validateSteps(steps) {
        if (!Array.isArray(steps) || steps.length === 0) {
            throw new Error('steps must be a non-empty array');
        }

        for (const step of steps) {
            if (!step || typeof step.description !== 'string' || step.description.trim().length === 0) {
                throw new Error('each step must have a non-empty description');
            }
        }
    }

    normalizeSteps(steps) {
        return steps.map((step, index) => ({
            step_id: step.step_id || this.generateStepId(index),
            description: step.description.trim(),
            status: 'pending'
        }));
    }

    buildTask(goal, steps, meta = {}) {
        this.validateGoal(goal);
        this.validateSteps(steps);

        const now = this.nowIso();
        const normalizedSteps = this.normalizeSteps(steps);

        return {
            task_id: this.generateTaskId(),
            goal: goal.trim(),
            status: 'pending',
            current_step_id: null,
            failure_reason: null,
            cancel_reason: null,
            created_at: now,
            updated_at: now,
            completed_at: null,
            ...meta,
            steps: normalizedSteps
        };
    }

    hasActiveTask() {
        return !!(this.currentTask && this.currentTask.status === 'in_progress');
    }

    getCurrentTask() {
        return this.currentTask;
    }

    getQueuedTasks() {
        return [...this.taskQueue];
    }

    getStepById(stepId) {
        if (!this.currentTask) return null;
        return this.currentTask.steps.find(step => step.step_id === stepId) || null;
    }

    getCurrentStep() {
        if (!this.currentTask || !this.currentTask.current_step_id) {
            return null;
        }
        return this.getStepById(this.currentTask.current_step_id);
    }

    startTask(task) {
        if (!task) {
            throw new Error('task is required');
        }

        const firstIncompleteStep = task.steps.find(step => step.status !== 'completed') || null;

        for (const step of task.steps) {
            if (step.status === 'in_progress') {
                step.status = 'pending';
            }
        }

        if (firstIncompleteStep) {
            firstIncompleteStep.status = 'in_progress';
            task.current_step_id = firstIncompleteStep.step_id;
            task.status = 'in_progress';
            task.completed_at = null;
        } else {
            task.current_step_id = null;
            task.status = 'completed';
            task.completed_at = task.completed_at || this.nowIso();
        }

        task.failure_reason = null;
        task.cancel_reason = null;
        this.touchTask(task);

        this.currentTask = task;
        this.save();
        return this.currentTask;
    }

    enqueueTask(goal, steps, meta = {}) {
        const task = this.buildTask(goal, steps, meta);

        if (!this.hasActiveTask()) {
            return this.startTask(task);
        }

        this.taskQueue.push(task);
        this.save();
        return task;
    }

    createTask(goal, steps, meta = {}) {
        return this.enqueueTask(goal, steps, meta);
    }

    advanceToNextTask() {
        if (this.taskQueue.length === 0) {
            this.currentTask = null;
            this.save();
            return null;
        }

        const nextTask = this.taskQueue.shift();
        return this.startTask(nextTask);
    }

    updateStepStatus(stepId, status) {
        if (!this.currentTask) {
            throw new Error('no current task');
        }

        if (!STEP_STATUSES.includes(status)) {
            throw new Error(`invalid step status: ${status}`);
        }

        if (this.currentTask.current_step_id !== stepId) {
            throw new Error(`can only update current step: ${this.currentTask.current_step_id}`);
        }

        const step = this.getStepById(stepId);
        if (!step) {
            throw new Error(`step not found: ${stepId}`);
        }

        for (const s of this.currentTask.steps) {
            if (s.step_id !== stepId && s.status === 'in_progress') {
                s.status = 'pending';
            }
        }

        step.status = status;
        this.touchTask();

        if (status === 'in_progress') {
            this.currentTask.status = 'in_progress';
            this.currentTask.current_step_id = stepId;
            this.save();
            return this.currentTask;
        }

        if (status === 'completed') {
            const allCompleted = this.currentTask.steps.every(s => s.status === 'completed');

            if (allCompleted) {
                return this.markTaskComplete();
            }

            return this.advanceToNextStep();
        }

        if (status === 'failed' || status === 'blocked') {
            this.currentTask.status = 'in_progress';
            this.currentTask.current_step_id = stepId;
            this.save();
            return this.currentTask;
        }

        if (status === 'pending') {
            this.currentTask.current_step_id = null;
        }

        this.save();
        return this.currentTask;
    }

    recordStepFailure(stepId) {
        if (!this.currentTask) {
            throw new Error('no current task');
        }

        const step = this.getStepById(stepId);
        if (!step) {
            throw new Error(`step not found: ${stepId}`);
        }

        if (this.currentTask.current_step_id !== stepId) {
            throw new Error(`can only fail current step: ${this.currentTask.current_step_id}`);
        }

        step.status = 'failed';
        this.currentTask.status = 'in_progress';
        this.currentTask.current_step_id = stepId;
        this.touchTask();
        this.save();

        return this.currentTask;
    }

    blockStep(stepId) {
        if (!this.currentTask) {
            throw new Error('no current task');
        }

        const step = this.getStepById(stepId);
        if (!step) {
            throw new Error(`step not found: ${stepId}`);
        }

        if (this.currentTask.current_step_id !== stepId) {
            throw new Error(`can only block current step: ${this.currentTask.current_step_id}`);
        }

        step.status = 'blocked';
        this.currentTask.status = 'in_progress';
        this.currentTask.current_step_id = stepId;
        this.touchTask();
        this.save();

        return this.currentTask;
    }

    resetStepForRetry(stepId) {
        if (!this.currentTask) {
            throw new Error('no current task');
        }

        const step = this.getStepById(stepId);
        if (!step) {
            throw new Error(`step not found: ${stepId}`);
        }

        if (this.currentTask.current_step_id !== stepId) {
            throw new Error(`can only retry current step: ${this.currentTask.current_step_id}`);
        }

        for (const s of this.currentTask.steps) {
            if (s.step_id !== stepId && s.status === 'in_progress') {
                s.status = 'pending';
            }
        }

        step.status = 'in_progress';
        this.currentTask.status = 'in_progress';
        this.currentTask.current_step_id = stepId;
        this.touchTask();
        this.save();

        return this.currentTask;
    }

    advanceToNextStep() {
        if (!this.currentTask) {
            throw new Error('no current task');
        }

        const nextStep = this.currentTask.steps.find(step => step.status === 'pending');

        if (!nextStep) {
            return this.markTaskComplete();
        }

        for (const step of this.currentTask.steps) {
            if (step.status === 'in_progress') {
                step.status = 'pending';
            }
        }

        nextStep.status = 'in_progress';
        this.currentTask.current_step_id = nextStep.step_id;
        this.currentTask.status = 'in_progress';
        this.touchTask();
        this.save();

        return this.currentTask;
    }

    markTaskComplete() {
        if (!this.currentTask) {
            throw new Error('no current task');
        }

        const completedTask = this.currentTask;
        const now = this.nowIso();

        completedTask.status = 'completed';
        completedTask.current_step_id = null;
        completedTask.completed_at = now;
        completedTask.updated_at = now;
        completedTask.steps = completedTask.steps.map(step => ({
            ...step,
            status: step.status === 'blocked' || step.status === 'failed' ? step.status : 'completed'
        }));

        this.writeTaskFile(completedTask);
        this.currentTask = null;
        this.saveIndex();
        this.advanceToNextTask();

        return completedTask;
    }

    markTaskFailed(reason = 'unknown failure') {
        if (!this.currentTask) {
            throw new Error('no current task');
        }

        const failedTask = this.currentTask;

        failedTask.status = 'failed';
        failedTask.failure_reason = reason;
        failedTask.current_step_id = null;
        this.touchTask(failedTask);

        this.writeTaskFile(failedTask);
        this.currentTask = null;
        this.saveIndex();
        this.advanceToNextTask();

        return failedTask;
    }

    cancelTask(reason = 'cancelled') {
        if (!this.currentTask) {
            throw new Error('no current task');
        }

        const cancelledTask = this.currentTask;

        cancelledTask.status = 'cancelled';
        cancelledTask.cancel_reason = reason;
        cancelledTask.current_step_id = null;
        this.touchTask(cancelledTask);

        this.writeTaskFile(cancelledTask);
        this.currentTask = null;
        this.saveIndex();
        this.advanceToNextTask();

        return cancelledTask;
    }

    cancelQueuedTaskByIndex(index, reason = 'cancelled by user') {
        if (!Number.isInteger(index) || index < 1) {
            throw new Error('queue index must be a positive integer');
        }

        const queueArrayIndex = index - 1;
        const task = this.taskQueue[queueArrayIndex];

        if (!task) {
            return null;
        }

        task.status = 'cancelled';
        task.cancel_reason = reason;
        task.current_step_id = null;
        this.touchTask(task);

        this.writeTaskFile(task);
        this.taskQueue.splice(queueArrayIndex, 1);
        this.saveIndex();

        return task;
    }

    clearCurrentTask() {
        this.currentTask = null;
        this.taskQueue = [];
        this.save();
    }

    writeTaskFile(task) {
        const filePath = this.getTaskFilePath(task);
        writeFileSync(filePath, JSON.stringify(task, null, 2), 'utf8');
    }

    saveIndex() {
        this.ensureTasksDir();

        const index = {
            current_task_id: this.currentTask ? this.currentTask.task_id : null,
            queued_task_ids: this.taskQueue.map(task => task.task_id)
        };

        writeFileSync(this.getTaskIndexPath(), JSON.stringify(index, null, 2), 'utf8');
    }

    save() {
        try {
            this.ensureTasksDir();

            if (this.currentTask) {
                this.writeTaskFile(this.currentTask);
            }

            for (const task of this.taskQueue) {
                this.writeTaskFile(task);
            }

            this.saveIndex();
        } catch (err) {
            console.error('Error saving task state:', err);
        }
    }

    loadTaskById(taskId) {
        try {
            const filePath = this.getTaskFilePath({ task_id: taskId });
            if (!existsSync(filePath)) {
                return null;
            }

            const raw = readFileSync(filePath, 'utf8').trim();
            if (!raw) {
                return null;
            }

            const parsed = JSON.parse(raw);
            if (!this.isValidTaskObject(parsed)) {
                return null;
            }

            return parsed;
        } catch {
            return null;
        }
    }

    loadFromIndex() {
        const indexPath = this.getTaskIndexPath();
        if (!existsSync(indexPath)) {
            return null;
        }

        const raw = readFileSync(indexPath, 'utf8').trim();
        if (!raw) {
            return null;
        }

        const index = JSON.parse(raw);

        const currentTask = index.current_task_id
            ? this.loadTaskById(index.current_task_id)
            : null;

        const queuedTasks = Array.isArray(index.queued_task_ids)
            ? index.queued_task_ids
                .map(taskId => this.loadTaskById(taskId))
                .filter(Boolean)
            : [];

        this.currentTask = currentTask && currentTask.status === 'in_progress'
            ? currentTask
            : null;

        this.taskQueue = queuedTasks.filter(task => task.status === 'pending');

        return this.currentTask;
    }

    loadLegacyFallback() {
        const tasksDir = this.getTasksDir();
        const files = readdirSync(tasksDir)
            .filter(file => file.startsWith('task_') && file.endsWith('.json'))
            .sort();

        const tasks = [];

        for (const file of files) {
            try {
                const filePath = path.join(tasksDir, file);
                const raw = readFileSync(filePath, 'utf8').trim();
                if (!raw) continue;

                const parsed = JSON.parse(raw);
                if (!this.isValidTaskObject(parsed)) continue;

                tasks.push(parsed);
            } catch {
                continue;
            }
        }

        const inProgressTasks = tasks.filter(task => task.status === 'in_progress');
        const pendingTasks = tasks.filter(task => task.status === 'pending');

        this.currentTask = inProgressTasks.length > 0
            ? inProgressTasks[inProgressTasks.length - 1]
            : null;

        this.taskQueue = pendingTasks;
        this.save();

        return this.currentTask;
    }

    load() {
        try {
            const tasksDir = this.getTasksDir();

            if (!existsSync(tasksDir)) {
                this.currentTask = null;
                this.taskQueue = [];
                return null;
            }

            const loadedFromIndex = this.loadFromIndex();
            if (loadedFromIndex || this.taskQueue.length > 0) {
                return this.currentTask;
            }

            return this.loadLegacyFallback();
        } catch (err) {
            console.error('Error loading task:', err);
            this.currentTask = null;
            this.taskQueue = [];
            return null;
        }
    }

    isValidTaskObject(task) {
        if (!task || typeof task !== 'object') return false;
        if (typeof task.task_id !== 'string') return false;
        if (typeof task.goal !== 'string') return false;
        if (!TASK_STATUSES.includes(task.status)) return false;
        if (!(typeof task.current_step_id === 'string' || task.current_step_id === null)) return false;
        if (!(typeof task.failure_reason === 'string' || task.failure_reason === null)) return false;
        if (!(typeof task.cancel_reason === 'string' || task.cancel_reason === null)) return false;
        if (typeof task.created_at !== 'string') return false;
        if (typeof task.updated_at !== 'string') return false;
        if (!(typeof task.completed_at === 'string' || task.completed_at === null)) return false;
        if (!Array.isArray(task.steps) || task.steps.length === 0) return false;

        for (const step of task.steps) {
            if (!step || typeof step !== 'object') return false;
            if (typeof step.step_id !== 'string') return false;
            if (typeof step.description !== 'string') return false;
            if (!STEP_STATUSES.includes(step.status)) return false;
        }

        return true;
    }

    formatStepLine(step) {
        return `- [${step.step_id}] ${step.description}`;
    }

    formatTaskSummaryLine(task, index) {
        return `${index + 1}. [${task.task_id}] ${task.goal}`;
    }

    formatForPrompt() {
    const queuedTasks = this.getQueuedTasks();

        if (!this.currentTask) {
            if (queuedTasks.length === 0) {
                return 'No active task.';
            }

            return [
                'Active Task:',
                'Goal: None',
                'Status: None',
                'Current Step: None',
                '',
                'Queued Tasks:',
                ...queuedTasks.slice(0, 3).map((task) => `- ${task.goal}`)
            ].join('\n');
        }

        const task = this.currentTask;
        const currentStep = this.getCurrentStep();

        const lines = [
            'Active Task:',
            `Goal: ${task.goal}`,
            `Status: ${task.status}`,
            `Current Step: ${currentStep ? `[${currentStep.step_id}] ${currentStep.description}` : 'None'}`
        ];

        if (task.failure_reason) {
            lines.push(`Failure Reason: ${task.failure_reason}`);
        }

        if (task.cancel_reason) {
            lines.push(`Cancel Reason: ${task.cancel_reason}`);
        }

        lines.push('');
        lines.push('Queued Tasks:');

        if (queuedTasks.length === 0) {
            lines.push('- None');
        } else {
            lines.push(...queuedTasks.slice(0, 3).map((queuedTask) => `- ${queuedTask.goal}`));
        }

        return lines.join('\n');
    }
}