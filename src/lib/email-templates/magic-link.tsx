import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your login link for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your login link</Heading>
        <Text style={text}>
          Click the button below to log in to {siteName}. This link will expire
          shortly.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Log In
        </Button>
        <Text style={footer}>
          If you didn't request this link, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

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
