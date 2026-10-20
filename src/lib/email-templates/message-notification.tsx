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

interface MessageNotificationProps {
  recipientName?: string
  senderName?: string
  subject?: string
  body?: string
  inboxUrl?: string
}

export const MessageNotificationEmail = ({
  recipientName,
  senderName,
  subject,
  body,
  inboxUrl,
}: MessageNotificationProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`New message from ${senderName ?? 'your school'}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>Meraki Education</Text>
        <Heading style={h1}>You have a new message</Heading>
        <Text style={text}>
          {recipientName ? `Hi ${recipientName},` : 'Hello,'} {senderName ?? 'A member of staff'}{' '}
          sent you a message on Meraki Education.
        </Text>
        <Section style={card}>
          <Text style={cardSubject}>{subject ?? 'New message'}</Text>
          <Text style={cardBody}>{body ?? 'Sign in to read the full message.'}</Text>
        </Section>
        <Button style={button} href={inboxUrl ?? 'https://meraki-education.app/messages'}>
          Open your inbox
        </Button>
        <Text style={footer}>
          You are receiving this because your Meraki Education account uses this email address for
          notifications. Replies to this address are not monitored — reply from your inbox in the
          site instead.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MessageNotificationEmail

export const template = {
  component: MessageNotificationEmail,
  subject: (data: Record<string, any>) =>
    data['subject'] ? `New message: ${data['subject']}` : 'You have a new message',
  displayName: 'New message notification',
  previewData: {
    recipientName: 'Jordan Reyes',
    senderName: 'Ms. Alvarez',
    subject: 'Reading log for this week',
    body: 'Please bring your reading log to class on Thursday so we can review it together.',
    inboxUrl: 'https://meraki-education.app/messages',
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
const card = {
  backgroundColor: '#f4f8fb',
  borderLeft: '3px solid #6fc6c9',
  borderRadius: '10px',
  padding: '16px 18px',
  margin: '0 0 24px',
}
const cardSubject = {
  fontSize: '15px',
  fontWeight: 700 as const,
  color: '#1b3a5c',
  margin: '0 0 8px',
}
const cardBody = {
  fontSize: '14px',
  color: '#43505f',
  lineHeight: '1.6',
  whiteSpace: 'pre-wrap' as const,
  margin: '0',
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
