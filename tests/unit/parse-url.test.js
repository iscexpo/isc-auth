const assert = require('assert')
const parseUrl = require('../../dist/lib/parse-url').default

describe('lib/parse-url', () => {
  it('returns localhost defaults when no url is given', () => {
    const { baseUrl, basePath } = parseUrl()
    assert.strictEqual(baseUrl, 'http://localhost:3000')
    assert.strictEqual(basePath, '/api/auth')
  })

  it('prefixes https when no protocol is specified', () => {
    const { baseUrl } = parseUrl('example.com')
    assert.strictEqual(baseUrl, 'https://example.com')
  })

  it('keeps an explicit http protocol', () => {
    const { baseUrl } = parseUrl('http://example.com')
    assert.strictEqual(baseUrl, 'http://example.com')
  })

  it('splits host and path correctly', () => {
    const { baseUrl, basePath } = parseUrl('https://example.com/auth')
    assert.strictEqual(baseUrl, 'https://example.com')
    assert.strictEqual(basePath, '/auth')
  })

  it('strips a trailing slash from the path', () => {
    const { basePath } = parseUrl('https://example.com/auth/')
    assert.strictEqual(basePath, '/auth')
  })
})
