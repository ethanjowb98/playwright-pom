import { TAGS, TEST_DATA } from '@config/constants';
import { build__NAME__ } from '@data/factories/__name__Factory';
import { expect, test } from '@fixtures';
import { labels, Severity } from '@utils/allure';

// Add TAGS.stateful to the describe tags if the resource touches the account-wide basket or orders.
test.describe('__FEATURE__ API', { tag: [TAGS.api] }, () => {
  test.beforeEach(async () => {
    await labels({ feature: '__FEATURE__' });
  });

  test(
    'should create a __name__ when the payload is valid',
    { tag: [TAGS.smoke] },
    async ({ seeder, __name__Api }) => {
      await labels({ story: 'Create', severity: Severity.BLOCKER });
      // Arrange
      const input = build__NAME__();

      // Act
      const created = seeder.track__NAME__(await __name__Api.create(input));

      // Assert (durability: re-read from the API)
      expect(await __name__Api.getById(created.id)).toMatchObject(input);
    },
  );

  test(
    'should return 404 when the __name__ does not exist',
    { tag: [TAGS.regression] },
    async ({ __name__Api }) => {
      await labels({ story: 'Not found', severity: Severity.NORMAL });

      await expect(__name__Api.getById(TEST_DATA.unknownId)).rejects.toMatchObject({ status: 404 });
    },
  );
});
