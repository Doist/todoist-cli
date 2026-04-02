/**
 * @type {import('semantic-release').GlobalConfig}
 */

const prereleaseBranches = [{ name: 'next', prerelease: true }]

const isPrerelease = prereleaseBranches.some((b) => b.name === process.env.GITHUB_REF_NAME)

export default {
    branches: ['main', ...prereleaseBranches],
    plugins: [
        ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }],
        ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }],
        // Only update CHANGELOG.md and commit back on stable releases
        ...(isPrerelease ? [] : ['@semantic-release/changelog']),
        '@semantic-release/npm',
        ...(isPrerelease
            ? []
            : [
                  [
                      '@semantic-release/git',
                      {
                          assets: ['CHANGELOG.md', 'package.json', 'package-lock.json'],
                          message:
                              'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
                      },
                  ],
              ]),
        '@semantic-release/github',
    ],
}
