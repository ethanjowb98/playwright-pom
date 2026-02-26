import { MilestoneElements } from './milestone_elements';
import { expect, Page } from '@playwright/test';

export class MilestoneFunctions {

    private element: MilestoneElements;
    private page: Page;

    constructor(page: Page) {
        this.element = new MilestoneElements(page);
        this.page = page;
    }

    async searchMilestone( milestoneName: string ): Promise<boolean> {
        await this.element.searchMilestone.clear();
        await this.element.searchMilestone.fill(milestoneName);
        await this.element.milestoneItem(milestoneName).waitFor({ state: 'visible', timeout: 3000 });
        return this.element.milestoneItem(milestoneName).isVisible();
    }

    async navigateToMilestoneItem( milestoneName: string ) {
        await expect(this.searchMilestone(milestoneName)).resolves.toBe(true);
        await this.element.milestoneItem(milestoneName).click();
    }

    async navigateToCards() { }

    async navigateToSubtasksTab() {
        await this.element.subtaskTab.click();
    }

    async searchSubtask( subtaskName: string ): Promise<boolean> {
        await this.page.waitForTimeout(1000);
        if (await this.element.searchSubtask.isDisabled()) {
            console.log('Search subtask input is disabled. Cannot perform search.');
            return false;
        }
        await this.element.searchSubtask.clear();
        await this.element.searchSubtask.fill(subtaskName);
        try{
            await this.element.milestoneSubtaskItem(subtaskName).waitFor({ state: 'visible', timeout: 3000 });
            return await this.element.milestoneSubtaskItem(subtaskName).isVisible();
        } catch (error) {
            console.log(`Subtask "${subtaskName}" not found.`);
            return false;
        }
    }

    async navigateToSubtaskItem( subtaskName: string ) {
        await expect(this.searchSubtask(subtaskName)).resolves.toBe(true);
        await this.element.viewButton(subtaskName).click();
    }

    async selectPartner( subtaskName: string ) {
        await this.element.searchPartner.clear();
        await this.element.searchPartner.fill(subtaskName);
        if (await this.element.partnerItem(subtaskName).isChecked() === false) {
            await this.element.partnerItem(subtaskName).click();
        }
        await expect(this.element.partnerItem(subtaskName)).toBeChecked();
    }

    async addPartnersToSubtask( subtaskName: string, partners: string[] ) {
        await this.element.addAssigneeButton(subtaskName).click();
        await this.page.waitForTimeout(1000);
        for (const partner of partners) {
            await this.selectPartner(partner);
        }
        await this.element.doneButton.click();
    }

    async createSubtask( subtaskName: string ) {
        await this.element.newSubtaskButton.click();
        await this.element.inputSubtaskName.fill(subtaskName);
        await this.element.createButton.click();
    }

    async closeSubtaskPanel(subtaskName: string) {
        await this.page.waitForTimeout(2000);
        await this.element.closeSubtaskPanel(subtaskName).click();
    }
}