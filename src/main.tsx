import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import {MockWalletPreview} from './MockWalletPreview'
import {walletDataSource} from './gateway/index'
import {WalletRenderBoundary} from './WalletRenderBoundary'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><WalletRenderBoundary resetKey={`wallet-root:${walletDataSource}`} title="FastLink Wallet unavailable" message="The application could not be rendered safely.">{walletDataSource === 'mock' ? <MockWalletPreview/> : <App/>}</WalletRenderBoundary></React.StrictMode>)
