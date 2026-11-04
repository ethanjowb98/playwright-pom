import { defineConfig } from 'allure';

import { ALLURE_CATEGORIES } from './src/config/allureCategories';
import { ALLURE } from './src/config/constants';

/**
 * Allure 3 report (`npm run allure:generate` / `allure:open`). Its Awesome report reads categories
 * from this config, not from `allure-results/categories.json`, so both use `ALLURE_CATEGORIES`.
 * Loaded by the Allure CLI outside tsconfig path aliases: relative imports only.
 */
export default defineConfig({
  name: 'Market test report',
  output: ALLURE.reportDir,
  // Each `allure generate` appends this run; the trend and history tabs read the last runs back.
  historyPath: `./${ALLURE.historyFile}`,
  historyLimit: ALLURE.historyLimit,
  categories: ALLURE_CATEGORIES,
  plugins: {
    awesome: {
      options: {
        reportName: 'Market test report',
        groupBy: ['epic', 'feature', 'story'],
      },
    },
  },
});
