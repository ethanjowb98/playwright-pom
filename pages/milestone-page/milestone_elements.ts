import { Page, Locator } from '@playwright/test';

export class MilestoneElements {

    constructor(private page: Page) {}

    // Parent Items
    milestoneItem(itemName: string): Locator {
        return this.page.getByText(itemName, { exact: true });
    }
    subtaskPanel(subtaskName: string): Locator {
        return this.page.locator(".milestone-subtask-panel", { hasText: subtaskName });
    }

    // Textboxes
    get searchPartner(): Locator { return this.page.getByRole('textbox', { name: 'Search partner' }) }
    get searchMilestone(): Locator { return this.page.getByRole('textbox', { name: 'Search' }) }
    get searchSubtask(): Locator { return this.page.getByRole('textbox', { name: 'Search subtask' }) }
    get inputSubtaskName(): Locator { return this.page.getByRole('textbox', { name: 'Enter subtask name' }) }

    // Buttons
    get subtaskTab(): Locator { return this.page.getByText('Subtasks', { exact: true }) }
    get doneButton(): Locator { return this.page.getByRole('button', { name: 'Done', exact: true }) }
    get newSubtaskButton(): Locator { return this.page.getByRole('button', { name: '󰐕 New subtask' }) }
    get createButton(): Locator { return this.page.getByRole('button', { name: 'Create', exact: true }) }
    closeSubtaskPanel(subtaskName: string): Locator {
        return this.subtaskPanel(subtaskName).getByRole('button', { name: 'Close' })
    }
    milestoneSubtaskItem(subtaskName: string): Locator {
        return this.page.locator(".milestone-subtask__info", { hasText: subtaskName });
    }
    viewButton(subtaskName: string): Locator {
        return this.milestoneSubtaskItem(subtaskName).getByRole('button', { name: `View` });
    }
    addAssigneeButton(subtaskName: string): Locator {
        return this.subtaskPanel(subtaskName).locator('.mdi-plus');
    }
    partnerItem(partnerName: string): Locator {
        return this.page.locator('.modal').locator('.avatar-container', { hasText: partnerName });
    }
}