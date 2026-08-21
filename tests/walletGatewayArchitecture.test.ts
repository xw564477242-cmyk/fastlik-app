import assert from 'node:assert/strict'
import {readFileSync, readdirSync, statSync} from 'node:fs'
import {join, resolve} from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const sourceRoot = join(root, 'src')
const files: string[] = []
const collect = (directory: string) => {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) collect(path)
    else if (/\.(?:ts|tsx)$/.test(path)) files.push(path)
  }
}
collect(sourceRoot)
const sources = new Map(files.map((file) => [file, readFileSync(file, 'utf8')]))

test('contains no Admin, Supabase or legacy bearer/session-storage implementation', () => {
  assert.equal(files.some((file) => /(?:^|\/)routes\/admin\.|(?:^|\/)components\/admin(?:\/|$)|admin-data/.test(file)), false)
  const all = [...sources.values()].join('\n')
  for (const forbidden of ['ADMIN_DICTS', '@supabase/', 'Bearer ', 'sessionStorage', 'credentials: \'omit\'', 'credentials:"omit"']) {
    assert.equal(all.includes(forbidden), false, `forbidden source marker: ${forbidden}`)
  }
})

test('allows browser fetch only in HttpWalletGateway transport', () => {
  const offenders = [...sources.entries()].filter(([file, value]) => value.includes('fetch(') && !file.endsWith('/gateway/httpTransport.ts'))
  assert.deepEqual(offenders.map(([file]) => file), [])
  const transport = sources.get(join(sourceRoot, 'gateway', 'httpTransport.ts')) ?? ''
  assert.match(transport, /credentials: 'include'/)
  assert.match(transport, /X-CSRF-Token/)
  assert.doesNotMatch(transport, /Authorization/)
})

test('separates v1 and v2 namespaces and forbids production mock', () => {
  const gateway = sources.get(join(sourceRoot, 'gateway', 'WalletGateway.ts')) ?? ''
  const selector = sources.get(join(sourceRoot, 'gateway', 'index.ts')) ?? ''
  const vite = readFileSync(join(root, 'vite.config.ts'), 'utf8')
  assert.match(gateway, /API_V1 = '\/v1'/)
  assert.match(gateway, /ONCHAIN_V2 = '\/v2\/wallet\/onchain'/)
  assert.match(selector, /Production Wallet builds forbid MockWalletGateway/)
  assert.match(selector, /VITE_FASTLINK_DATA_SOURCE/)
  assert.match(vite, /mode === 'production' && dataSource === 'mock'/)
})

test('financial presentation performs no numeric fee, rate or balance calculations', () => {
  const panel = sources.get(join(sourceRoot, 'Phase2WalletPanel.tsx')) ?? ''
  assert.doesNotMatch(panel, /parseFloat|parseInt|Number\s*\(|Math\./)
  assert.doesNotMatch(panel, /platformFee\s*[+\-*/]|networkFee\s*[+\-*/]|fxFee\s*[+\-*/]|ledgerBalance\s*[+\-*/]|availableBalance\s*[+\-*/]/)
  assert.match(panel, /Backend-calculated financial values only/)
})

test('Phase2 client includes address rotation, saved-address withdrawal gates, reorg review, physical cards and card funding', () => {
  const panel = sources.get(join(sourceRoot, 'Phase2WalletPanel.tsx')) ?? ''
  for (const marker of ['rotateDepositAddress', 'withdrawalAddresses', 'addressCoolingPeriodSeconds', "state === 'REORGED'", 'createPhysicalCard', 'reportCardLost', 'topupCard']) {
    assert.match(panel, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})
