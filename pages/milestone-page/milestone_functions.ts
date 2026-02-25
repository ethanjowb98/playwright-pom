import { MilestoneElements } from './milestone_elements';

export class MilestoneFunctions extends MilestoneElements {

    async searchMilestone( milestoneName: string ) {
        await this.searchMilestoneElement.clear();
        await this.searchMilestoneElement.fill(milestoneName);
        this.milestoneItemElement(milestoneName).click();
    }

    async navigateToCards() { }
}