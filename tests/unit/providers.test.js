const assert = require('assert')
const providers = require('../../dist/providers').default

describe('providers', () => {
  const expected = [
    'Apple', 'Atlassian', 'Auth0', 'AzureADB2C', 'Basecamp', 'BattleNet',
    'Box', 'Bungie', 'Cognito', 'Credentials', 'Discord', 'Email',
    'Facebook', 'Foursquare', 'FusionAuth', 'GitHub', 'GitLab', 'Google',
    'IdentityServer4', 'LinkedIn', 'MailRu', 'Mixer', 'Netlify', 'Okta',
    'Reddit', 'Slack', 'Spotify', 'Strava', 'Twitch', 'Twitter', 'VK', 'Yandex'
  ]

  it('exports all expected provider factories', () => {
    for (const name of expected) {
      assert.strictEqual(typeof providers[name], 'function', `${name} should be a factory`)
    }
  })

  it('groups oauth providers under providers/oauth with type "oauth"', () => {
    const google = providers.Google({ id: 'google', clientId: 'x', clientSecret: 'y' })
    assert.strictEqual(google.type, 'oauth')
    assert.strictEqual(google.id, 'google')
  })

  it('exposes a credentials provider with type "credentials"', () => {
    const credentials = providers.Credentials({ id: 'credentials' })
    assert.strictEqual(credentials.type, 'credentials')
  })
})
