import { expect, test } from '@fixtures';
import { TAGS } from '@config/constants';
import { build__NAME__ } from '@data/factories/__name__Factory';

test.describe('__FEATURE__ API', () => {
  test.beforeEach(async ({ allure }) => {
    await allure.labels({ epic: 'Market', feature: '__FEATURE__', owner: 'qa' });
  });

  test('should create a __name__ when the payload is valid', { tag: [TAGS.api, TAGS.smoke] }, async ({ seeder, __name__Api }) => {
    // Arrange
    const input = build__NAME__();

    // Act
    const created = await seeder.track(await __name__Api.create(input));

    // Assert (durability: re-read from the API)
    const fetched = await __name__Api.getById(created.id);
    expect(fetched).toMatchObject(input);
  });

  test('should return 404 when the __name__ does not exist', { tag: [TAGS.api, TAGS.regression] }, async ({ __name__Api }) => {
    await expect(__name__Api.getById('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({ status: 404 });
  });
});
