import {HttpWalletGateway} from './HttpWalletGateway'
import {MockWalletGateway} from './MockWalletGateway'
import type {WalletDataSource} from './contracts'

const env = (import.meta as ImportMeta & {env?: ImportMetaEnv}).env
const requested = (env?.VITE_FASTLINK_DATA_SOURCE?.trim().toLowerCase() || 'backend') as WalletDataSource
const production = env?.PROD === true || env?.VITE_FASTLINK_ENVIRONMENT === 'PRODUCTION'

if (!['backend', 'mock'].includes(requested)) throw new Error('VITE_FASTLINK_DATA_SOURCE must be backend or mock')
if (production && requested === 'mock') throw new Error('Production Wallet builds forbid MockWalletGateway')

export const walletGateway = requested === 'mock' ? new MockWalletGateway() : new HttpWalletGateway()
export const walletDataSource = requested

export * from './contracts'
export * from './httpTransport'
export type * from './WalletGateway'
