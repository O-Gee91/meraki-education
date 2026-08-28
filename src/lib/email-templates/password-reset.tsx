import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

import type { TemplateEntry } from './registry'

interface PasswordResetProps {
  recipientName?: string
  resetUrl?: string
}

export const PasswordResetEmail = ({ recipientName, resetUrl }: PasswordResetProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your Meraki Education password</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>Meraki Education</Text>
        <Heading style={h1}>Reset your password</Heading>
        <Text style={text}>
          {recipientName ? `Hi ${recipientName},` : 'Hello,'} we received a request to reset the
          password for your Meraki Education account. Use the button below to choose a new
          password — the link works once and expires shortly.
        </Text>
        <Section>
          <Button style={button} href={resetUrl ?? '#'}>
            Choose a new password
          </Button>
        </Section>
        <Text style={text}>
          If you did not ask for this, you can ignore this email — your password stays the same.
        </Text>
        <Text style={footer}>
          You are receiving this because this email address is registered to a Meraki Education
          account. Replies to this address are not monitored.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default PasswordResetEmail

export const template = {
  component: PasswordResetEmail,
  subject: 'Reset your Meraki Education password',
  displayName: 'Password reset',
  previewData: {
    recipientName: 'Jordan Reyes',
    resetUrl: 'https://meraki-education.lovable.app/reset-password',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "'Manrope', 'Helvetica Neue', Arial, sans-serif",
}
const container = {
  maxWidth: '560px',
  margin: '0 auto',
  padding: '32px 28px',
  borderTop: '4px solid #1b3a5c',
}
const eyebrow = {
  fontSize: '11px',
  letterSpacing: '0.14em',
  textTransform: 'uppercase' as const,
  color: '#4a8f96',
  fontWeight: 700 as const,
  margin: '0 0 8px',
}
const h1 = {
  fontSize: '23px',
  fontWeight: 'bold' as const,
  color: '#1b3a5c',
  letterSpacing: '-0.01em',
  margin: '0 0 20px',
}
const text = {
  fontSize: '15px',
  color: '#43505f',
  lineHeight: '1.6',
  margin: '0 0 22px',
}
const button = {
  backgroundColor: '#1b3a5c',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 600 as const,
  borderRadius: '10px',
  padding: '13px 24px',
  textDecoration: 'none',
  display: 'inline-block',
  margin: '0 0 22px',
}
const footer = {
  fontSize: '12px',
  color: '#7c8896',
  lineHeight: '1.6',
  borderTop: '1px solid #e6ebf1',
  padding: '18px 0 0',
  margin: '32px 0 0',
}
