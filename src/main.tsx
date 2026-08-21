import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import {MockWalletPreview} from './MockWalletPreview'
import {walletDataSource} from './gateway/index'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{walletDataSource === 'mock' ? <MockWalletPreview/> : <App/>}</React.StrictMode>)
