/** Browser-side passkey helpers. Call only from event handlers or effects. */
export async function passkeysSupported(): Promise<{ supported: boolean; builtIn: boolean }> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return { supported: false, builtIn: false };
  let builtIn = false;
  try {
    builtIn = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    builtIn = false;
  }
  return { supported: true, builtIn };
}

/** Turns browser errors into calm, bilingual messages. */
export function passkeyErrorMessage(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "AbortError") return "Cancelled or timed out. Try again. 已取消或超时，请重试。";
  if (name === "InvalidStateError") return "This device is already added. 此设备已添加。";
  if (name === "SecurityError") return "Passkeys can't be used on this site address. 此网址不支持通行密钥。";
  return "Something went wrong with the passkey. 通行密钥出错，请重试。";
}
