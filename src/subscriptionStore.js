import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_STORE_PATH = path.resolve(__dirname, '../data/subscriptions.json');

export function isValidSubscription(sub) {
  return Boolean(
    sub &&
      typeof sub === 'object' &&
      typeof sub.endpoint === 'string' &&
      sub.endpoint.trim().length > 0 &&
      sub.keys &&
      typeof sub.keys.p256dh === 'string' &&
      sub.keys.p256dh.trim().length > 0 &&
      typeof sub.keys.auth === 'string' &&
      sub.keys.auth.trim().length > 0
  );
}

export class SubscriptionStore {
  constructor(filePath = process.env.SUBSCRIPTIONS_FILE || DEFAULT_STORE_PATH) {
    this.filePath = filePath;
    this.subscriptions = new Map();
    this.loadFromDisk();
  }

  loadFromDisk() {
    try {
      if (!fs.existsSync(this.filePath)) {
        return;
      }

      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) {
        for (const sub of parsed) {
          if (isValidSubscription(sub)) {
            this.subscriptions.set(sub.endpoint, sub);
          }
        }
      }
    } catch (error) {
      console.warn('No se pudieron cargar suscripciones previas desde disco:', error.message);
    }
  }

  saveToDisk() {
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        this.filePath,
        JSON.stringify(this.getAll(), null, 2),
        'utf-8'
      );
    } catch (error) {
      // En entornos con sistema de archivos efímero o de solo lectura se mantiene en memoria.
      console.warn('No se pudieron guardar suscripciones en disco (modo memoria):', error.message);
    }
  }

  upsert(subscription) {
    const normalized = {
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime ?? null,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    };

    const existed = this.subscriptions.has(normalized.endpoint);
    this.subscriptions.set(normalized.endpoint, normalized);
    this.saveToDisk();

    return { existed, total: this.subscriptions.size };
  }

  removeByEndpoint(endpoint) {
    const deleted = this.subscriptions.delete(endpoint);
    if (deleted) {
      this.saveToDisk();
    }
    return deleted;
  }

  getAll() {
    return Array.from(this.subscriptions.values());
  }

  size() {
    return this.subscriptions.size;
  }
}
