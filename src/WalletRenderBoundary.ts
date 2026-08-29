import React, {Component, type ErrorInfo, type ReactNode} from 'react'

export const WALLET_RENDER_FAILURE_CODE='WALLET_RENDER_UNAVAILABLE'

type WalletRenderBoundaryProps={
 children:ReactNode
 resetKey:string
 title:string
 message:string
 retryEnabled?:boolean
}

type WalletRenderBoundaryState={failed:boolean}

/**
 * Keeps synchronous React failures from collapsing the complete Wallet root.
 * Error objects and component stacks are deliberately not rendered or sent to
 * an application telemetry channel. React may still report a caught exception
 * to the browser's local developer console.
 */
export class WalletRenderBoundary extends Component<WalletRenderBoundaryProps,WalletRenderBoundaryState>{
 state:WalletRenderBoundaryState={failed:false}

 static getDerivedStateFromError():WalletRenderBoundaryState{return {failed:true}}

 componentDidCatch(_error:Error,_info:ErrorInfo):void{
  // Intentionally empty. Error text, response bodies and component stacks are
  // not copied into the UI or an application telemetry channel.
 }

 componentDidUpdate(previous:WalletRenderBoundaryProps):void{
  if(this.state.failed&&previous.resetKey!==this.props.resetKey)this.setState({failed:false})
 }

 private retry=()=>this.setState({failed:false})

 render():ReactNode{
  if(!this.state.failed)return this.props.children
  return React.createElement(
   'section',
   {className:'panel wallet-render-fallback',role:'alert','data-diagnostic-code':WALLET_RENDER_FAILURE_CODE},
   React.createElement('h2',null,this.props.title),
   React.createElement('p',null,this.props.message),
   React.createElement('p',null,'No stale data displayed.'),
   this.props.retryEnabled===false?null:React.createElement('button',{type:'button',onClick:this.retry},'Retry wallet view'),
  )
 }
}
