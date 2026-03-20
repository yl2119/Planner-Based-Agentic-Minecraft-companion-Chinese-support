const fs = require('fs');
const path = require('path');

class TaskManager {
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

    touchTask() {
        if (this.currentTask) {
            this.currentTask.updated_at = new Date().toISOString();
        }
    }

    validateSteps(steps) {
        if (!Array.isArray(steps) || steps.length === 0) {
            throw new Error('steps must be a non-empty array');
        }

        for (const step of steps) {
            if (!step || typeof step.description !== 'string' || step.description.trim() === '') {
                throw new Error('each step must have a non-empty description');
            }
        }
    }

    createTask(goal, steps) {
        if (typeof goal !== 'string' || goal.trim() === '') {
            throw new Error('goal must be a non-empty string');
        }

        this.validateSteps(steps);

        const now = new Date().toISOString();

        const normalizedSteps = steps.map((step, index) => ({
            step_id: step.step_id || this.generateStepId(index),
            description: step.description.trim(),
            status: index === 0 ? 'in_progress' : 'pending'
        }));

        this.currentTask = {
            task_id: this.generateTaskId(),
            goal: goal.trim(),
            status: 'in_progress',
            current_step_id: normalizedSteps[0].step_id,
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

    updateStepStatus(stepId, status) {
        if (!this.currentTask) {
            throw new Error('no current task');
        }

        const validStatuses = ['pending', 'in_progress', 'completed', 'failed', 'blocked'];
        if (!validStatuses.includes(status)) {
            throw new Error(`invalid step status: ${status}`);
        }

        const step = this.currentTask.steps.find(s => s.step_id === stepId);
        if (!step) {
            throw new Error(`step not found: ${stepId}`);
        }

        step.status = status;
        this.touchTask();

        if (status === 'failed') {
            this.markTaskFailed(`step failed: ${step.description}`);
            return this.currentTask;
        }

        if (status === 'completed') {
            const allCompleted = this.currentTask.steps.every(s => s.status === 'completed');
            if (allCompleted) {
                this.markTaskComplete();
            } else if (this.currentTask.current_step_id === stepId) {
                this.advanceToNextStep();
            } else {
                this.save();
            }
            return this.currentTask;
        }

        if (status === 'in_progress') {
            this.currentTask.current_step_id = stepId;
            this.currentTask.status = 'in_progress';
            this.save();
            return this.currentTask;
        }

        this.save();
        return this.currentTask;
    }

    advanceToNextStep() {
        if (!this.currentTask) {
            throw new Error('no current task');
        }

        const nextStep = this.currentTask.steps.find(step => step.status === 'pending');

        if (!nextStep) {
            this.markTaskComplete();
            return this.currentTask;
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

        const now = new Date().toISOString();
        this.currentTask.status = 'completed';
        this.currentTask.current_step_id = null;
        this.currentTask.completed_at = now;
        this.currentTask.updated_at = now;
        this.save();
        return this.currentTask;
    }

    markTaskFailed(reason) {
        if (!this.currentTask) {
            throw new Error('no current task');
        }

        this.currentTask.status = 'failed';
        this.currentTask.failure_reason = reason || 'unknown failure';
        this.currentTask.current_step_id = null;
        this.touchTask();
        this.save();
        return this.currentTask;
    }

    cancelTask(reason) {
        if (!this.currentTask) {
            throw new Error('no current task');
        }

        this.currentTask.status = 'cancelled';
        this.currentTask.cancel_reason = reason || 'cancelled';
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
        const filePath = this.getTaskFilePath();
        const dirPath = path.dirname(filePath);

        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        fs.writeFileSync(filePath, JSON.stringify(this.currentTask, null, 2), 'utf8');
    }

    load() {
        const filePath = this.getTaskFilePath();

        if (!fs.existsSync(filePath)) {
            this.currentTask = null;
            return null;
        }

        const raw = fs.readFileSync(filePath, 'utf8').trim();

        if (!raw) {
            this.currentTask = null;
            return null;
        }

        this.currentTask = JSON.parse(raw);
        return this.currentTask;
    }

    formatForPrompt() {
        if (!this.currentTask) {
            return 'No active task.';
        }

        const task = this.currentTask;
        const currentStep = task.steps.find(step => step.step_id === task.current_step_id) || null;
        const completedSteps = task.steps.filter(step => step.status === 'completed');
        const pendingSteps = task.steps.filter(step => step.status === 'pending');
        const inProgressSteps = task.steps.filter(step => step.status === 'in_progress');
        const blockedSteps = task.steps.filter(step => step.status === 'blocked');
        const failedSteps = task.steps.filter(step => step.status === 'failed');

        let text = '';
        text += `Goal: ${task.goal}\n`;
        text += `Task Status: ${task.status}\n`;
        text += `Current Step: ${currentStep ? currentStep.description : 'None'}\n`;

        if (task.failure_reason) {
            text += `Failure Reason: ${task.failure_reason}\n`;
        }

        if (task.cancel_reason) {
            text += `Cancel Reason: ${task.cancel_reason}\n`;
        }

        text += '\nCompleted Steps:\n';
        text += completedSteps.length
            ? completedSteps.map(s => `- ${s.description}`).join('\n')
            : '- None';

        text += '\n\nIn Progress Steps:\n';
        text += inProgressSteps.length
            ? inProgressSteps.map(s => `- ${s.description}`).join('\n')
            : '- None';

        text += '\n\nPending Steps:\n';
        text += pendingSteps.length
            ? pendingSteps.map(s => `- ${s.description}`).join('\n')
            : '- None';

        text += '\n\nBlocked Steps:\n';
        text += blockedSteps.length
            ? blockedSteps.map(s => `- ${s.description}`).join('\n')
            : '- None';

        text += '\n\nFailed Steps:\n';
        text += failedSteps.length
            ? failedSteps.map(s => `- ${s.description}`).join('\n')
            : '- None';

        return text;
    }
}

module.exports = TaskManager;