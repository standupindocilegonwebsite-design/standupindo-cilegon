const encoder = new TextEncoder();
const ACCESS_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function normalizeWhatsapp(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('62')) return `62${digits.slice(2).replace(/^0+/, '')}`;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
}

export function randomToken(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createAccessCode() {
  const limit = Math.floor(256 / ACCESS_CODE_ALPHABET.length) * ACCESS_CODE_ALPHABET.length;
  let characters = '';
  while (characters.length < 8) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    for (const byte of bytes) {
      if (byte >= limit) continue;
      characters += ACCESS_CODE_ALPHABET[byte % ACCESS_CODE_ALPHABET.length];
      if (characters.length === 8) break;
    }
  }
  return `${characters.slice(0, 4)}-${characters.slice(4)}`;
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function accessCodeHash(eventId: string, whatsapp: string, code: string, pepper: string) {
  return sha256(`${eventId}:${whatsapp}:${code.replace(/\s|-/g, '').toUpperCase()}:${pepper}`);
}

export async function whatsappAccessCodeHash(whatsapp: string, code: string, pepper: string) {
  return sha256(`${whatsapp}:${code.replace(/\s|-/g, '').toUpperCase()}:${pepper}`);
}

async function encryptionKey(secret: string) {
  const raw = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function encodeBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decodeBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export async function encryptSecret(value: string, secret: string) {
  const key = await encryptionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(value));
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return encodeBase64(combined);
}

export async function decryptSecret(value: string, secret: string) {
  const combined = decodeBase64(value);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const key = await encryptionKey(secret);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}