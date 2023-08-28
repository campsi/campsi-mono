/* eslint-disable no-template-curly-in-string */
module.exports = {
  branches: [
    'master',
    {
      name: 'beta',
      prerelease: true
    }
  ],
  plugins: [
    '@semantic-release/commit-analyzer',
    {
      preset: 'eslint',
      releaseRules: [
        { scope: 'no-release', release: false },
        { type: '', release: 'patch' }
      ]
    },
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    '@semantic-release/npm',
    '@semantic-release/github',
    [
      '@semantic-release/git',
      { message: 'chore(release): set `package.json` to ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}' }
    ]
  ]
};
