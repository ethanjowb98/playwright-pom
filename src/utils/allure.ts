import { test, type TestDetailsAnnotation } from '@playwright/test';
import {
  epic,
  feature as setFeature,
  owner as setOwner,
  severity as setSeverity,
  type Severity as AllureSeverity,
  story as setStory,
} from 'allure-js-commons';

import { ALLURE } from '@config/constants';

export { Severity } from 'allure-js-commons';

export interface AllureLabels {
  /** Domain, e.g. `Products`. Also sets epic `Market` and the default owner. */
  feature?: string;
  /** Behaviour within the feature, e.g. `Create`. */
  story?: string;
  severity?: AllureSeverity;
  /** Overrides the default owner (`ALLURE.owner`). */
  owner?: string;
}

/** Applies Allure labels; call from `beforeEach` for the feature and from the test for story and severity. */
export async function labels({ feature, story, severity, owner }: AllureLabels): Promise<void> {
  if (feature) {
    await epic(ALLURE.epic);
    await setFeature(feature);
    if (!owner) await setOwner(ALLURE.owner);
  }
  if (story) await setStory(story);
  if (severity) await setSeverity(severity);
  if (owner) await setOwner(owner);
}

/**
 * Parks a test on a known product defect:
 * `test.fixme(title, { tag, annotation: productDefect('Products', '<what the app does wrong>') }, body)`.
 * The reason becomes the skip message, which the `Known product defect` Allure category matches. A
 * fixme test never runs `beforeEach`, so its epic, feature and owner come from annotations instead.
 */
export function productDefect(feature: string, reason: string): TestDetailsAnnotation[] {
  return [
    { type: 'fixme', description: `${ALLURE.productDefectPrefix} ${reason}` },
    { type: '@allure.label.epic', description: ALLURE.epic },
    { type: '@allure.label.feature', description: feature },
    { type: '@allure.label.owner', description: ALLURE.owner },
  ];
}

/**
 * Method decorator for every layer (page objects, API clients, seeder): runs the method as a boxed
 * Playwright step, so it shows in the trace, the HTML report and Allure (allure-playwright records
 * `test.step` as an Allure step), and a failure points at the calling spec line. The title is fixed, or
 * built from the method's leading arguments: `@step((method: string, path: string) => \`${method} ${path}\`)`.
 */
export function step<Leading extends unknown[] = []>(
  title: string | ((...args: Leading) => string),
) {
  return function <This, Args extends [...Leading, ...unknown[]], Return>(
    target: (this: This, ...args: Args) => Promise<Return>,
    _context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<Return>>,
  ): (this: This, ...args: Args) => Promise<Return> {
    // `test.step` only works inside a test (fixtures included), not in global setup or worker-scoped code.
    // Must be async with `return await`: Playwright captures the step location after an await, so only
    // async frames survive, and it drops the first user frame (this wrapper) to point at the caller.
    return async function (this: This, ...args: Args): Promise<Return> {
      const name = typeof title === 'string' ? title : title(...(args as unknown as Leading));
      return await test.step(name, () => target.call(this, ...args), { box: true });
    };
  };
}
