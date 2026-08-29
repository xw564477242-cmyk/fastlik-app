import React, {type ReactNode} from 'react'
import {
  isReadOnlyUatSession,
  READ_ONLY_UAT_MARKER,
  type FastLinkInteractionMode,
} from './interactionMode.ts'

type BoundaryProps = Readonly<{
  interactionMode: FastLinkInteractionMode
  runtimeEnvironment: string
  sessionEnvironment: string
  children: ReactNode
}>

export function AuthenticatedBusinessWriteBoundary({
  interactionMode,
  runtimeEnvironment,
  sessionEnvironment,
  children,
}: BoundaryProps) {
  if (isReadOnlyUatSession(runtimeEnvironment, sessionEnvironment, interactionMode)) return null
  return React.createElement(React.Fragment, null, children)
}

export function ReadOnlyUatCapabilityMarker({
  interactionMode,
  runtimeEnvironment,
  sessionEnvironment,
}: Omit<BoundaryProps, 'children'>) {
  if (!isReadOnlyUatSession(runtimeEnvironment, sessionEnvironment, interactionMode)) return null
  return React.createElement(
    'section',
    {
      className: 'panel readonly-uat-capability',
      'data-fastlink-capability': READ_ONLY_UAT_MARKER,
      'data-business-write-surface': 'disabled',
    },
    React.createElement('b', null, READ_ONLY_UAT_MARKER),
    React.createElement(
      'p',
      {className: 'card-action-note'},
      'This isolated TEST preview exposes authenticated reads only. Business write controls are not mounted.',
    ),
  )
}
