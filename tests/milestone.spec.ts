import { test, expect } from '@playwright/test';
import { USERS } from '../test-data/users';
import { GLOBAL } from '../test-data/global';
import { card_subtask } from '../test-data/milestone_card_subtask';
import { subtasks } from '../test-data/milestone_subtask';
import { MilestoneFunctions } from '../pages/milestone-page/milestone_functions';
import { writeFileSync } from 'fs';

test.describe('milestone', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GLOBAL.url);
    await page.getByRole('link', { name: 'Sign in' }).click();
    await page.getByRole('textbox', { name: 'Enter email or username' }).fill(USERS.personal.email);
    await page.getByRole('textbox', { name: 'Enter password' }).fill(USERS.personal.password);
    await page.getByRole('textbox', { name: 'Enter password' }).press('Enter');
    await page.getByText('BPOSeats').click();
    await page.getByRole('link', { name: 'Milestones' }).click();
    await page.getByRole('textbox', { name: 'Search' }).click();
  });
  test('create milestone card subtask', async ({ page }) => {
    await page.getByRole('textbox', { name: 'Search' }).fill(`${USERS.personal.firstName} ${USERS.personal.lastName}`);
    page.pause();
    await page.getByText(`${USERS.personal.firstName} ${USERS.personal.lastName}`).click();
    await page.getByText('Cards').click();
    for (const [cardName, subtaskDetails] of card_subtask) {
      await page.getByRole('textbox', { name: 'Search card' }).fill(cardName);
      await page.waitForTimeout(1000); // 1 second delay
      await expect(page.locator('.milestone-card')).toBeVisible();
      await page.getByRole('button', { name: 'View' }).first().click();
      for (let i = subtaskDetails[0]; i <= subtaskDetails[1]; i+=subtaskDetails[2]) {
        await page.getByRole('textbox', { name: 'Search subtask' }).fill(`Week ${i}: ${cardName}`);
        try {
          await expect(page.getByText(`Week ${i}: ${cardName}`)).toBeVisible( { timeout: 3000 } );
          await page.locator('.add').click();
          await page.getByText(`[Week ${i}]`).fill(`Week ${i}: ${cardName}`);
          await page.getByRole('button', { name: 'Add', exact: true }).click();
        } catch (error) {
          console.log(`Subtask "Week ${i}: ${cardName}" already exists. Skipping creation.`);
          continue;
        }
      }
      await page.locator('#close-button').click();
    }
  });
  test('create milestone subtask', async ({ page }) => {
    const milestoneFunctions = new MilestoneFunctions(page);
    const itemName = 'QA | UI Automation | C Sprint | 2026';
    await milestoneFunctions.navigateToMilestoneItem(itemName);
    await milestoneFunctions.navigateToSubtasksTab();
    for (const subtask in subtasks) {
      const partners = subtasks[subtask];
      if (await milestoneFunctions.searchSubtask(subtask) === false) {
        await milestoneFunctions.createSubtask(subtask);
      }
      await milestoneFunctions.navigateToSubtaskItem(subtask);
      await milestoneFunctions.addPartnersToSubtask(subtask, partners);
      await milestoneFunctions.closeSubtaskPanel(subtask);
    }
  });
  test('approves request card', async ({ page }) => {
    await page.getByRole('textbox', { name: 'Search' }).click();
    await page.getByRole('textbox', { name: 'Search' }).fill('QA | UI Automation | B Sprint | 2026');
    await page.getByText('QA | UI Automation | B Sprint |').click();
    await page.getByText('Requests').click();
    while (true) {
      try {
        await expect(page.getByRole('button', { name: 'Approve' }).first()).toBeVisible( { timeout: 5000 } );
        await page.getByRole('button', { name: 'Approve' }).first().click();
      }
      catch (error) {
        break;
      }
      await page.waitForTimeout(2000);
    }
  });
  test('move milestone cards to done', async ({ page, request }) => {
    const data = {
      username: "amanda@bposeats.com",
      password: "bposeats",
      type: "password",
    }
    const response = await request.post("https://develop-centralbpo.cxrole.com/hqzen-signin/", { form: data } );
    const responseBody = await response.json();
    console.log(`Login response status: ${response.status()}`);
    writeFileSync('response.json', JSON.stringify(responseBody, null, 2));
  });
});