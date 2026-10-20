import { afterEach, expect, it, vi } from 'vitest'

vi.mock('@lovable.dev/email-js', () => ({
  EmailAPIError: class extends Error {},
  sendLovableEmail: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@react-email/render', () => ({ render: vi.fn().mockResolvedValue('Rendered email') }))

import { sendLovableEmail } from '@lovable.dev/email-js'
import { sendTemplateEmail } from './send-email'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

it('sends existing app emails through notify.meraki-education.app', async () => {
  vi.stubEnv('LOVABLE_API_KEY', 'test-only-key')
  await expect(sendTemplateEmail('message-notification', 'student@example.com', {
    idempotencyKey: 'message-notification-test-event',
  })).resolves.toEqual({ sent: true })
  expect(sendLovableEmail).toHaveBeenCalledWith(expect.objectContaining({
    sender_domain: 'notify.meraki-education.app',
    from: { name: 'Meraki Education', address: 'noreply@notify.meraki-education.app' },
    to: 'student@example.com',
    idempotency_key: 'message-notification-test-event',
  }), expect.any(Object))
})