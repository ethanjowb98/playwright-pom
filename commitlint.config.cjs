// One-line Conventional Commits only, e.g. `feat(m2): add data seeder`.
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 72],
    'body-empty': [2, 'always'],
    'footer-empty': [2, 'always'],
    'scope-case': [2, 'always', 'lower-case'],
  },
};
