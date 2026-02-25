import { Page, Locator } from '@playwright/test';

export class MilestoneElements {
    constructor(private page: Page) {}

    get searchPartnerElement(): Locator { return this.page.getByRole('textbox', { name: 'Search partner' }) }
    get searchMilestoneElement(): Locator { return this.page.getByRole('textbox', { name: 'Search' }) }
    milestoneItemElement( itemName:string ): Locator { return this.page.getByRole('link', { name: itemName }) }
}