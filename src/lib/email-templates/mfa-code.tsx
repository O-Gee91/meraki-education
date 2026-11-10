import * as React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  recipientName?: string
  code?: string
  reset?: boolean
}

export const MfaCodeEmail = ({ recipientName, code, reset }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{reset ? 'Your two-step verification was reset' : 'Your Meraki sign-in code'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>Meraki Education</Text>
        {reset ? (
          <>
            <Heading style={h1}>Two-step verification was turned off</Heading>
            <Text style={text}>
              {recipientName ? `Hi ${recipientName},` : 'Hello,'} a school administrator reset
              two-step verification on your account. You can sign in with your password and set
              up your authenticator again in Account settings. If you did not ask for this, tell
              your administrator.
            </Text>
          </>
        ) : (
          <>
            <Heading style={h1}>Your sign-in code</Heading>
            <Text style={text}>
              {recipientName ? `Hi ${recipientName},` : 'Hello,'} use this code to finish signing
              in. It works once and expires in 10 minutes.
            </Text>
            <Text style={codeStyle}>{code ?? '000000'}</Text>
            <Text style={text}>
              After signing in, two-step verification will be off until you set up your
              authenticator again in Account settings. If you did not try to sign in, change your
              password.
            </Text>
          </>
        )}
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: MfaCodeEmail,
  subject: (d: Record<string, any>) =>
    d['reset'] ? 'Your two-step verification was reset' : 'Your Meraki sign-in code',
  displayName: 'Two-step verification',
  previewData: { recipientName: 'Ms. Alvarez', code: '482913' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Manrope', 'Helvetica Neue', Arial, sans-serif" }
const container = { maxWidth: '560px', margin: '0 auto', padding: '32px 28px', borderTop: '4px solid #1b3a5c' }
const eyebrow = { fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#4a8f96', fontWeight: 700 as const, margin: '0 0 8px' }
const h1 = { fontSize: '23px', fontWeight: 'bold' as const, color: '#1b3a5c', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#43505f', lineHeight: '1.6', margin: '0 0 22px' }
const codeStyle = { fontSize: '32px', letterSpacing: '0.3em', fontWeight: 700 as const, color: '#1b3a5c', backgroundColor: '#f4f8fb', borderRadius: '10px', padding: '16px', textAlign: 'center' as const, margin: '0 0 22px' }
