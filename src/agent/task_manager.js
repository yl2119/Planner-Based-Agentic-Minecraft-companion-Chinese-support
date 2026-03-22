import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'failed', 'cancelled'];
const STEP_STATUSES = ['pending', 'in_progress', 'completed', 'failed', 'blocked'];

export class TaskManager {
    constructor(agent) {
        this.agent = agent;
        this.currentTask = null;
    }

    getTaskFilePath() {
        return path.join('.', 'bots', this.agent.name, 'current_task.json');
    }

    generateTaskId() {
        const now = new Date();
        const stamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
        return `task_${stamp}`;
    }

    generateStepId(index) {
        return `step_${index + 1}`;
    }

    nowIso() {
        return new Date().toISOString();
    }

    touchTask() {
        if (this.currentTask) {
            this.currentTask.updated_at = this.nowIso();
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
            status: step.status && STEP_STATUSES.includes(step.status)
                ? step.status
                : (index === 0 ? 'in_progress' : 'pending')
        }));
    }

    createTask(goal, steps) {
        this.validateGoal(goal);
        this.validateSteps(steps);

        const now = this.nowIso();
        const normalizedSteps = this.normalizeSteps(steps);
        const currentStep = normalizedSteps.find(step => step.status === 'in_progress') || normalizedSteps[0];

        this.currentTask = {
            task_id: this.generateTaskId(),
            goal: goal.trim(),
            status: 'in_progress',
            current_step_id: currentStep ? currentStep.step_id : null,
            failure_reason: null,
            cancel_reason: null,
            created_at: now,
            updated_at: now,
            completed_at: null,
            steps: normalizedSteps
        };

        this.save();
        return this.currentTask;
    }

    getCurrentTask() {
        return this.currentTask;
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

    updateStepStatus(stepId, status) {
        if (!this.currentTask) {
            throw new Error('no current task');
        }

        if (!STEP_STATUSES.includes(status)) {
            throw new Error(`invalid step status: ${status}`);
        }

        const step = this.getStepById(stepId);
        if (!step) {
            throw new Error(`step not found: ${stepId}`);
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

            if (this.currentTask.current_step_id === stepId) {
                return this.advanceToNextStep();
            }

            this.save();
            return this.currentTask;
        }

        if (status === 'failed' || status === 'blocked') {
            this.currentTask.status = 'in_progress';
            this.currentTask.current_step_id = stepId;
            this.save();
            return this.currentTask;
        }

        if (status === 'pending' && this.currentTask.current_step_id === stepId) {
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

        const now = this.nowIso();
        this.currentTask.status = 'completed';
        this.currentTask.current_step_id = null;
        this.currentTask.completed_at = now;
        this.currentTask.updated_at = now;
        this.save();

        return this.currentTask;
    }

    markTaskFailed(reason = 'unknown failure') {
        if (!this.currentTask) {
            throw new Error('no current task');
        }

        this.currentTask.status = 'failed';
        this.currentTask.failure_reason = reason;
        this.currentTask.current_step_id = null;
        this.touchTask();
        this.save();

        return this.currentTask;
    }

    cancelTask(reason = 'cancelled') {
        if (!this.currentTask) {
            throw new Error('no current task');
        }

        this.currentTask.status = 'cancelled';
        this.currentTask.cancel_reason = reason;
        this.currentTask.current_step_id = null;
        this.touchTask();
        this.save();

        return this.currentTask;
    }

    clearCurrentTask() {
        this.currentTask = null;
        this.save();
    }

    save() {
        try {
            const filePath = this.getTaskFilePath();
            const dirPath = path.dirname(filePath);

            if (!existsSync(dirPath)) {
                mkdirSync(dirPath, { recursive: true });
            }

            writeFileSync(filePath, JSON.stringify(this.currentTask, null, 2), 'utf8');
        } catch (err) {
            console.error('Error saving current task:', err);
        }
    }

    load() {
        try {
            const filePath = this.getTaskFilePath();

            if (!existsSync(filePath)) {
                this.currentTask = null;
                return null;
            }

            const raw = readFileSync(filePath, 'utf8').trim();

            if (!raw) {
                this.currentTask = null;
                return null;
            }

            const parsed = JSON.parse(raw);

            if (parsed === null) {
                this.currentTask = null;
                return null;
            }

            if (!this.isValidTaskObject(parsed)) {
                console.warn('Invalid current_task.json format. Resetting current task to null.');
                this.currentTask = null;
                return null;
            }

            this.currentTask = parsed;
            return this.currentTask;
        } catch (err) {
            console.error('Error loading current task:', err);
            this.currentTask = null;
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

    formatForPrompt() {
        if (!this.currentTask) {
            return 'No active task.';
        }

        const task = this.currentTask;
        const currentStep = this.getCurrentStep();
        const completedSteps = task.steps.filter(step => step.status === 'completed');
        const pendingSteps = task.steps.filter(step => step.status === 'pending');
        const inProgressSteps = task.steps.filter(step => step.status === 'in_progress');
        const blockedSteps = task.steps.filter(step => step.status === 'blocked');
        const failedSteps = task.steps.filter(step => step.status === 'failed');

        const formatStepList = (steps) =>
            steps.length > 0
                ? steps.map(step => this.formatStepLine(step)).join('\n')
                : '- None';

        let text = '';
        text += `Goal: ${task.goal}\n`;
        text += `Task Status: ${task.status}\n`;
        text += `Current Step: ${currentStep ? `[${currentStep.step_id}] ${currentStep.description}` : 'None'}\n`;

        if (task.failure_reason) {
            text += `Failure Reason: ${task.failure_reason}\n`;
        }

        if (task.cancel_reason) {
            text += `Cancel Reason: ${task.cancel_reason}\n`;
        }

        text += '\nCompleted Steps:\n';
        text += formatStepList(completedSteps);

        text += '\n\nIn Progress Steps:\n';
        text += formatStepList(inProgressSteps);

        text += '\n\nPending Steps:\n';
        text += formatStepList(pendingSteps);

        text += '\n\nBlocked Steps:\n';
        text += formatStepList(blockedSteps);

        text += '\n\nFailed Steps:\n';
        text += formatStepList(failedSteps);

        return text;
    }
}