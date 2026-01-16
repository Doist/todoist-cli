import { createHash, randomBytes } from 'node:crypto'

const VERIFIER_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
const VERIFIER_LENGTH = 64

export function generateCodeVerifier(): string {
    const bytes = randomBytes(VERIFIER_LENGTH)
    let verifier = ''
    for (let i = 0; i < VERIFIER_LENGTH; i++) {
        verifier += VERIFIER_CHARSET[bytes[i] % VERIFIER_CHARSET.length]
    }
    return verifier
}

export function generateCodeChallenge(verifier: string): string {
    const hash = createHash('sha256').update(verifier).digest()
    return hash.toString('base64url')
}

export function generateState(): string {
    return randomBytes(16).toString('hex')
}
