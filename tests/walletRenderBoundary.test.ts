import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'
import React from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import {WALLET_RENDER_FAILURE_CODE,WalletRenderBoundary} from '../src/WalletRenderBoundary.ts'

const text=(value:TestRenderer.ReactTestRendererJSON|TestRenderer.ReactTestRendererJSON[]|null):string=>JSON.stringify(value)

test('the application root and authenticated Wallet tree are both wired through a boundary',()=>{
 const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8')
 const main=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8')
 assert.match(app,/session&&<WalletRenderBoundary resetKey=\{sessionScope\(session\)\}/)
 assert.match(app,/<\/div><\/WalletRenderBoundary>}/)
 assert.match(main,/<WalletRenderBoundary resetKey=\{`wallet-root:\$\{walletDataSource}`}[^>]*>\{walletDataSource/)
})

test('a post-login render exception becomes a safe recoverable panel',()=>{
 const originalConsoleError=console.error
 // React reports caught errors to the local test console. Silence that framework
 // output here; the assertion below verifies that none of it reaches the UI.
 console.error=()=>undefined
 let shouldThrow=true
 const ThrowingWallet=()=>{
  if(shouldThrow)throw new Error('sensitive-runtime-detail-must-not-render')
  return React.createElement('div',null,'Verified Wallet shell')
 }
 try{
  let renderer!:TestRenderer.ReactTestRenderer
  act(()=>{renderer=TestRenderer.create(React.createElement(WalletRenderBoundary,{resetKey:'session-a',title:'Wallet view unavailable',message:'The authenticated Wallet view could not be rendered safely.'},React.createElement(ThrowingWallet)))})
  const fallback=text(renderer.toJSON())
  assert.match(fallback,/Wallet view unavailable/)
  assert.match(fallback,/No stale data displayed/)
  assert.match(fallback,new RegExp(WALLET_RENDER_FAILURE_CODE))
  assert.doesNotMatch(fallback,/sensitive-runtime-detail/)
  shouldThrow=false
  act(()=>{renderer.root.findByType('button').props.onClick()})
  assert.match(text(renderer.toJSON()),/Verified Wallet shell/)
 }finally{console.error=originalConsoleError}
})

test('the authenticated header and sign-out control survive a Wallet subtree exception',()=>{
 const originalConsoleError=console.error
 console.error=()=>undefined
 const BrokenWallet=()=>{throw new Error('wallet subtree failed')}
 try{
  const renderer=TestRenderer.create(React.createElement(
   'main',
   null,
   React.createElement('header',null,React.createElement('h1',null,'FastLink Wallet'),React.createElement('button',{type:'button'},'Sign out')),
   React.createElement(WalletRenderBoundary,{resetKey:'session-a',title:'Wallet view unavailable',message:'Safe fallback.'},React.createElement(BrokenWallet)),
  ))
  const rendered=text(renderer.toJSON())
  assert.match(rendered,/FastLink Wallet/)
  assert.match(rendered,/Sign out/)
  assert.match(rendered,/Wallet view unavailable/)
 }finally{console.error=originalConsoleError}
})

test('retrying a persistent failure returns to the fallback without a render loop',()=>{
 const originalConsoleError=console.error
 console.error=()=>undefined
 let renderCount=0
 const PersistentlyBroken=()=>{renderCount+=1;throw new Error('still unavailable')}
 try{
  let renderer!:TestRenderer.ReactTestRenderer
  act(()=>{renderer=TestRenderer.create(React.createElement(WalletRenderBoundary,{resetKey:'wallet-root',title:'FastLink Wallet unavailable',message:'Safe fallback.'},React.createElement(PersistentlyBroken)))})
  const initialRenderCount=renderCount
  assert.ok(initialRenderCount>=1&&initialRenderCount<=2)
  act(()=>{renderer.root.findByType('button').props.onClick()})
  assert.ok(renderCount>initialRenderCount&&renderCount<=initialRenderCount+2)
  assert.match(text(renderer.toJSON()),/FastLink Wallet unavailable/)
 }finally{console.error=originalConsoleError}
})

test('a new authenticated scope clears a prior render failure',()=>{
 const originalConsoleError=console.error
 console.error=()=>undefined
 const Broken=()=>{throw new Error('render failed')}
 try{
  let renderer!:TestRenderer.ReactTestRenderer
  act(()=>{renderer=TestRenderer.create(React.createElement(WalletRenderBoundary,{resetKey:'session-a',title:'Wallet view unavailable',message:'Safe fallback.'},React.createElement(Broken)))})
  assert.match(text(renderer.toJSON()),/Wallet view unavailable/)
  act(()=>{renderer.update(React.createElement(WalletRenderBoundary,{resetKey:'session-b',title:'Wallet view unavailable',message:'Safe fallback.'},React.createElement('div',null,'New session Wallet shell')))})
  assert.match(text(renderer.toJSON()),/New session Wallet shell/)
 }finally{console.error=originalConsoleError}
})
