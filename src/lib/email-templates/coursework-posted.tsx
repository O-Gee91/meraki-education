import * as React from 'react'

import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'

import type { TemplateEntry } from './registry'

interface Props {
  recipientName?: string
  studentName?: string
  isGuardian?: boolean
  kindLabel?: string
  title?: string
  className?: string
  teacherName?: string
  dueText?: string
  description?: string
  openUrl?: string
}

export const CourseworkPostedEmail = ({
  recipientName,
  studentName,
  isGuardian,
  kindLabel = 'assignment',
  title,
  className,
  teacherName,
  dueText,
  description,
  openUrl,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`New ${kindLabel}${className ? ` in ${className}` : ''}: ${title ?? ''}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>Meraki Education</Text>
        <Heading style={h1}>{`A new ${kindLabel} was posted`}</Heading>
        <Text style={text}>
          {recipientName ? `Hi ${recipientName},` : 'Hello,'}{' '}
          {isGuardian
            ? `${teacherName ?? 'A teacher'} posted a new ${kindLabel} for ${studentName ?? 'your child'}${className ? ` in ${className}` : ''}.`
            : `${teacherName ?? 'Your teacher'} posted a new ${kindLabel}${className ? ` in ${className}` : ''}.`}
        </Text>
        <Section style={card}>
          <Text style={cardSubject}>{title ?? 'New coursework'}</Text>
          <Text style={cardMeta}>{dueText ? `Due ${dueText}` : 'No due date set'}</Text>
          {description ? <Text style={cardBody}>{description}</Text> : null}
        </Section>
        <Button style={button} href={openUrl ?? 'https://meraki-education.app/assignments'}>
          Open in Meraki
        </Button>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: CourseworkPostedEmail,
  subject: (d: Record<string, any>) =>
    `New ${d['kindLabel'] ?? 'assignment'}${d['className'] ? ` in ${d['className']}` : ''}: ${d['title'] ?? ''}`,
  displayName: 'Coursework posted',
  previewData: {
    recipientName: 'Jordan Reyes',
    kindLabel: 'assignment',
    title: 'Chapter 4 reading response',
    className: 'G8 English',
    teacherName: 'Ms. Alvarez',
    dueText: 'Oct 30, 2026',
    description: 'Write a one-page response to the chapter.',
    openUrl: 'https://meraki-education.app/assignments',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Manrope', 'Helvetica Neue', Arial, sans-serif" }
const container = { maxWidth: '560px', margin: '0 auto', padding: '32px 28px', borderTop: '4px solid #1b3a5c' }
const eyebrow = { fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#4a8f96', fontWeight: 700 as const, margin: '0 0 8px' }
const h1 = { fontSize: '23px', fontWeight: 'bold' as const, color: '#1b3a5c', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#43505f', lineHeight: '1.6', margin: '0 0 22px' }
const card = { backgroundColor: '#f4f8fb', borderLeft: '3px solid #6fc6c9', borderRadius: '10px', padding: '16px 18px', margin: '0 0 24px' }
const cardSubject = { fontSize: '15px', fontWeight: 700 as const, color: '#1b3a5c', margin: '0 0 6px' }
const cardMeta = { fontSize: '13px', color: '#4a8f96', margin: '0 0 8px' }
const cardBody = { fontSize: '14px', color: '#43505f', lineHeight: '1.6', margin: '0', whiteSpace: 'pre-wrap' as const }
const button = { backgroundColor: '#1b3a5c', color: '#ffffff', borderRadius: '10px', padding: '12px 22px', fontSize: '14px', fontWeight: 700 as const, textDecoration: 'none' }
