import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from '@react-email/components'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to join {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>You've been invited</Heading>
        <Text style={text}>
          You've been invited to join{' '}
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          . Click the button below to accept the invitation and create your
          account.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Accept Invitation
        </Button>
        <Text style={footer}>
          If you weren't expecting this invitation, you can safely ignore this
          email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

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
const link = { color: '#1b3a5c', textDecoration: 'underline' }
const button = {
  backgroundColor: '#1b3a5c',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 600 as const,
  borderRadius: '10px',
  padding: '13px 24px',
  textDecoration: 'none',
  display: 'inline-block',
}
const footer = {
  fontSize: '12px',
  color: '#7c8896',
  lineHeight: '1.6',
  borderTop: '1px solid #e6ebf1',
  padding: '18px 0 0',
  margin: '32px 0 0',
}
