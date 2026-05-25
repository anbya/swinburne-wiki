import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getMessaging as getMessagingAdmin, type Messaging } from 'firebase-admin/messaging'

type ServiceAccountLike = {
  project_id?: unknown
  client_email?: unknown
  private_key?: unknown
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizePrivateKey(key: string) {
  // Common pattern when storing keys in env vars
  return key.replace(/\\n/g, '\n')
}

function parseServiceAccountFromEnv(): {
  projectId: string
  clientEmail: string
  privateKey: string
} {
  const raw = asNonEmptyString(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? process.env.FIREBASE_SERVICE_ACCOUNT
  )

  if (raw) {
    let jsonText = raw

    // Allow base64-encoded JSON too.
    if (!jsonText.trim().startsWith('{')) {
      try {
        jsonText = Buffer.from(jsonText, 'base64').toString('utf8')
      } catch {
        // ignore
      }
    }

    let parsed: ServiceAccountLike
    try {
      parsed = JSON.parse(jsonText) as ServiceAccountLike
    } catch {
      throw new Error(
        'Invalid FIREBASE_SERVICE_ACCOUNT_JSON/FIREBASE_SERVICE_ACCOUNT (must be JSON or base64-encoded JSON)'
      )
    }

    const projectId = asNonEmptyString(parsed.project_id)
    const clientEmail = asNonEmptyString(parsed.client_email)
    const privateKeyRaw = asNonEmptyString(parsed.private_key)

    if (!projectId || !clientEmail || !privateKeyRaw) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON is missing project_id/client_email/private_key'
      )
    }

    return {
      projectId,
      clientEmail,
      privateKey: normalizePrivateKey(privateKeyRaw),
    }
  }

  const projectId = asNonEmptyString(process.env.FIREBASE_PROJECT_ID)
  const clientEmail = asNonEmptyString(process.env.FIREBASE_CLIENT_EMAIL)
  const privateKeyRaw = asNonEmptyString(process.env.FIREBASE_PRIVATE_KEY)

  if (!projectId || !clientEmail || !privateKeyRaw) {
    throw new Error(
      'Missing Firebase Admin credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON (recommended) or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.'
    )
  }

  return {
    projectId,
    clientEmail,
    privateKey: normalizePrivateKey(privateKeyRaw),
  }
}

function getOrInitFirebaseAdminApp(): App {
  const existing = getApps()[0]
  if (existing) return existing

  const globalForFirebase = globalThis as unknown as {
    __firebaseAdminApp?: App
  }

  if (globalForFirebase.__firebaseAdminApp) {
    return globalForFirebase.__firebaseAdminApp
  }

  const { projectId, clientEmail, privateKey } = parseServiceAccountFromEnv()
  const app = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    projectId,
  })

  globalForFirebase.__firebaseAdminApp = app
  return app
}

export function getFirebaseMessaging(): Messaging {
  const app = getOrInitFirebaseAdminApp()
  return getMessagingAdmin(app)
}
