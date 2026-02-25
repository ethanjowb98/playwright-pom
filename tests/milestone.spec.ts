import { test, expect, request } from '@playwright/test';
import { USERS } from '../test-data/users';
import { GLOBAL } from '../test-data/global';
import { card_subtask } from '../test-data/milestone_card_subtask';
import { subtask, members } from '../test-data/milestone_subtask';
import { MilestoneFunctions } from '../pages/milestone-page/milestone_functions';
import { url } from 'node:inspector';
import { writeFileSync } from 'fs';

test.describe('milestone', () => {
  // test.beforeEach(async ({ page }) => {
  //   await page.goto(GLOBAL.prodURL);
  //   await page.getByRole('link', { name: 'Sign in' }).click();
  //   await page.getByRole('textbox', { name: 'Enter email or username' }).fill(USERS.personal.email);
  //   await page.getByRole('textbox', { name: 'Enter password' }).fill(USERS.personal.password);
  //   await page.getByRole('textbox', { name: 'Enter password' }).press('Enter');
  //   await page.getByText('BPOSeats').click();
  //   await page.getByRole('link', { name: 'Milestones' }).click();
  //   await page.getByRole('textbox', { name: 'Search' }).click();
  // });
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
    await page.getByRole('textbox', { name: 'Search' }).click();
    await page.getByRole('textbox', { name: 'Search' }).fill('QA | UI Automation | B Sprint | 2026');
    await page.getByText('QA | UI Automation | B Sprint |').click();
    await page.getByText('Subtasks', { exact: true }).click();
    for (const substask_name of subtask) {
      await page.getByRole('textbox', { name: 'Search subtask' }).click();
      await page.getByRole('textbox', { name: 'Search subtask' }).fill(substask_name);
      try {
        await expect(page.locator(".milestone-subtask__info", { hasText: substask_name })).toBeVisible( { timeout: 3000 } );
        console.log(`Subtask "${substask_name}" already exists. Skipping creation.`);
      } catch (error) {
        console.log(`Subtask "${substask_name}" does not exist. Proceeding with creation.`);
        await page.getByRole('button', { name: 'New subtask' }).click( { timeout: 3000 } );
        await page.getByRole('textbox', { name: 'Enter subtask name' }).click();
        await page.getByRole('textbox', { name: 'Enter subtask name' }).fill(substask_name);
        await page.getByRole('button', { name: 'Create' }).click();
      }
      await page.locator(".milestone-subtask__info", { hasText: substask_name }).getByRole('button', { name: 'View' }).click();
      try {
        await expect(page.getByText(`Assignees (${members.length})`)).toBeVisible( { timeout: 3000 } );
        console.log(`All members are already assigned to the subtask "${substask_name}". Skipping assignment.`);
      } catch (error) {
        console.log(`Assigning members to the subtask "${substask_name}".`);
        await page.locator('.small.iconic.success').click();
        for (const member of members) {
          await page.getByRole('textbox', { name: 'Search partner' }).click();
          await page.getByRole('textbox', { name: 'Search partner' }).clear();
          await page.getByRole('textbox', { name: 'Search partner' }).fill(member);
          if (await page.locator(`xpath=//label[contains(.,'${member}')]`).isChecked( { timeout: 10000 } ) === false) {
            await page.locator(`xpath=//label[contains(.,'${member}')]`).click();
          }
          else {
            console.log(`Member "${member}" is already assigned to the subtask. Skipping assignment.`);
          }
        }
        await page.getByRole('button', { name: 'Done', exact: true }).click();
      }
      await page.waitForTimeout(5000);
      await page.locator('.milestone-subtask-panel').locator('.close').click();
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