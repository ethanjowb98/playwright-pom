import { type Page } from '@playwright/test';

import { TIMEOUTS } from '@config/constants';

export type DialogResponse = 'accept' | 'dismiss';

/**
 * Runs an action that opens a native `confirm()`/`alert()` and answers it. Listening starts before the
 * action so the dialog never blocks the page, and stops with it: if no dialog opens within the action
 * timeout this throws, and no handler is left behind to answer a later, unrelated dialog. Returns the
 * dialog message.
 */
export async function answerDialog(
  page: Page,
  action: () => Promise<unknown>,
  response: DialogResponse = 'accept',
): Promise<string> {
  const [message] = await Promise.all([
    page.waitForEvent('dialog', { timeout: TIMEOUTS.action }).then(async (dialog) => {
      await (response === 'accept' ? dialog.accept() : dialog.dismiss());
      return dialog.message();
    }),
    action(),
  ]);
  return message;
}
