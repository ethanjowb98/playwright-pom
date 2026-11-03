import * as allure from 'allure-js-commons';

import { ALLURE } from '@config/constants';

export { Severity } from 'allure-js-commons';

export interface AllureLabels {
  /** Domain, e.g. `Products`. Also sets epic `Market`. */
  feature?: string;
  /** Behaviour within the feature, e.g. `Create`. */
  story?: string;
  severity?: allure.Severity;
}

/** Applies Allure labels; call from `beforeEach` for the feature and from the test for story and severity. */
export async function labels({ feature, story, severity }: AllureLabels): Promise<void> {
  if (feature) {
    await allure.epic(ALLURE.epic);
    await allure.feature(feature);
  }
  if (story) await allure.story(story);
  if (severity) await allure.severity(severity);
}
