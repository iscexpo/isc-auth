#!/usr/bin/env node
/**
 * Codemod: migrate from the deprecated tuple `useSession()` hook to the new
 * Better Auth style `useAuthSession()` hook.
 *
 * Transforms:
 *   import { useSession } from 'isc-auth'
 *     -> adds useAuthSession to the named imports
 *
 *   const [session, loading] = useSession()
 *   const [data, loading] = useSession(initialSession)
 *     -> const { data: session, isPending: loading } = useAuthSession()
 *
 * Usage:
 *   node tools/codemod-use-session.js <file-or-directory> [...more]
 *
 * Files are modified in place. Only .js/.jsx/.ts/.tsx files are processed.
 * The initial session argument (if any) is dropped - pass it through a
 * Provider instead if you rely on server-provided session data.
 *
 * NOTE: `loading` was renamed to `isPending`. The codemod preserves your local
 * variable names via destructuring aliases, so no call sites need to change.
 */
const fs = require('fs')
const path = require('path')

const EXTS = new Set(['.js', '.jsx', '.ts', '.tsx'])
const PKG_NAME = 'isc-auth'

function collectFiles (target, files = []) {
  const stat = fs.statSync(target)
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target)) {
      if (entry === 'node_modules' || entry.startsWith('.')) { continue }
      collectFiles(path.join(target, entry), files)
    }
  } else if (EXTS.has(path.extname(target))) {
    files.push(target)
  }
  return files
}

// const [a, b] = useSession(...)  ->  const { data: a, isPending: b } = useAuthSession()
const TUPLE_RE = /const\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\]\s*=\s*useSession\s*\([^)]*\)/g

function addImport (src) {
  // Matches: import { ... } from 'isc-auth'   (single or double quotes)
  const importRe = new RegExp('(import\\s*\\{)([^}]*)(\\}\\s*from\\s*[\'"]' + PKG_NAME + '[\'"])')
  const match = src.match(importRe)

  if (!match) { return { src, changed: false, needsManualImport: true } }

  const names = match[2].split(',').map(s => s.trim()).filter(Boolean)
  if (!names.includes('useSession')) { return { src, changed: false, needsManualImport: false } }

  if (!names.includes('useAuthSession')) {
    names.push('useAuthSession')
  }
  return {
    src: src.replace(importRe, `$1 ${names.join(', ')} $3`),
    changed: true,
    needsManualImport: false
  }
}

function transform (src) {
  let touched = false

  let out = src.replace(TUPLE_RE, (full, dataName, pendingName) => {
    touched = true
    return `const { data: ${dataName}, isPending: ${pendingName} } = useAuthSession()`
  })

  if (touched) {
    const result = addImport(out)
    out = result.src
    return { src: out, changed: true, needsManualImport: result.needsManualImport }
  }

  return { src: out, changed: false, needsManualImport: false }
}

function main () {
  const targets = process.argv.slice(2)

  if (targets.length === 0) {
    console.log(`Usage: node ${path.basename(process.argv[1])} <file-or-directory> [...more]`)
    console.log('Migrates tuple useSession() usages to useAuthSession(). Files are modified in place.')
    process.exit(1)
  }

  let totalFiles = 0
  let changedFiles = 0
  const warnings = []

  for (const target of targets) {
    for (const file of collectFiles(target)) {
      totalFiles += 1
      const src = fs.readFileSync(file, 'utf8')
      const result = transform(src)

      if (result.changed) {
        fs.writeFileSync(file, result.src)
        changedFiles += 1
        console.log(`updated: ${file}`)
        if (result.needsManualImport) {
          warnings.push(`${file}: uses useAuthSession now but no existing '${PKG_NAME}' import found - add it manually`)
        }
      }
    }
  }

  console.log(`\n${changedFiles}/${totalFiles} file(s) updated.`)
  for (const warning of warnings) { console.warn(`WARNING: ${warning}`) }
}

main()
