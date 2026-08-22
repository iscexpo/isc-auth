const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const CODEMOD = path.join(__dirname, '../../tools/codemod-use-session.js')

function run (files) {
  const result = spawnSync(process.execPath, [CODEMOD, ...files], { encoding: 'utf8' })
  return `${result.stdout}${result.stderr}`
}

function tmpFile (content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemod-'))
  const file = path.join(dir, 'component.jsx')
  fs.writeFileSync(file, content)
  return file
}

describe('tools/codemod-use-session', () => {
  it('rewrites tuple destructuring and adds the import', () => {
    const file = tmpFile([
      "import { useSession } from 'isc-auth'",
      '',
      'export default function Page () {',
      '  const [session, loading] = useSession()',
      '  if (loading) { return null }',
      '  return <div>{session && session.user.name}</div>',
      '}'
    ].join('\n'))

    run([file])

    const out = fs.readFileSync(file, 'utf8')
    assert.ok(out.includes("import { useSession, useAuthSession } from 'isc-auth'"))
    assert.ok(out.includes('const { data: session, isPending: loading } = useAuthSession()'))
    assert.ok(!out.includes('const [session, loading]'))
  })

  it('keeps custom variable names as aliases and drops initial session args', () => {
    const file = tmpFile([
      "import { useSession } from 'isc-auth'",
      'const [data, pending] = useSession(initialSession)'
    ].join('\n'))

    run([file])

    const out = fs.readFileSync(file, 'utf8')
    assert.ok(out.includes('const { data: data, isPending: pending } = useAuthSession()'))
  })

  it('does not touch files without tuple usage but still leaves imports alone', () => {
    const original = [
      "import { useSession } from 'isc-auth'",
      'const s = useSessionTupleNotUsed()'
    ].join('\n')
    const file = tmpFile(original)

    run([file])

    assert.strictEqual(fs.readFileSync(file, 'utf8'), original)
  })

  it('processes directories recursively', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemod-dir-'))
    fs.mkdirSync(path.join(dir, 'nested'))
    const a = path.join(dir, 'a.js')
    const b = path.join(dir, 'nested', 'b.tsx')
    fs.writeFileSync(a, "import { useSession } from 'isc-auth'\nconst [s, l] = useSession()")
    fs.writeFileSync(b, "import { useSession } from 'isc-auth'\nconst [x, y] = useSession()")

    run([dir])

    assert.ok(fs.readFileSync(a, 'utf8').includes('useAuthSession()'))
    assert.ok(fs.readFileSync(b, 'utf8').includes('useAuthSession()'))
  })

  it('warns when there is no isc-auth import to extend', () => {
    const file = tmpFile('const [s, l] = useSession()')
    const output = run([file])

    assert.ok(output.includes('add it manually'))
    assert.ok(fs.readFileSync(file, 'utf8').includes('useAuthSession()'))
  })
})
