import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import webpush from 'web-push';

import { SubscriptionStore, isValidSubscription } from './subscriptionStore.js';

const PORT = Number(process.env.PORT) || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@fakestore-pwa.local';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY?.trim();
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY?.trim();

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error(
    'ERROR: Faltan VAPID_PUBLIC_KEY y/o VAPID_PRIVATE_KEY en las variables de entorno.'
  );
  console.error('Ejecuta "npm run generate-vapid" y configúralas en .env o en tu hosting.');
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const app = express();
const store = new SubscriptionStore();

const corsOptions =
  CORS_ORIGIN === '*'
    ? { origin: true }
    : {
        origin: CORS_ORIGIN.split(',').map((origin) => origin.trim()),
      };

app.use(cors(corsOptions));
app.use(express.json({ limit: '256kb' }));

// Health check para monitoreo y plataformas de despliegue (Render, Railway, etc.)
app.get(['/', '/api/health'], (_req, res) => {
  res.json({
    status: 'ok',
    service: 'fakestore-pwa-push-server',
    subscriptions: store.size(),
  });
});

// Devuelve la clave pública VAPID configurada en el servidor
app.get('/api/vapid-public-key', (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Consulta informativa de suscripciones activas (sin exponer llaves privadas de cifrado)
app.get('/api/subscriptions', (_req, res) => {
  const list = store.getAll().map((sub) => ({
    endpoint: sub.endpoint,
    expirationTime: sub.expirationTime,
  }));

  res.json({
    total: list.length,
    subscriptions: list,
  });
});

// Registra la suscripción enviada por SwPush desde el frontend Angular
app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;

  if (!isValidSubscription(subscription)) {
    return res.status(400).json({
      ok: false,
      error: 'Objeto de suscripción inválido. Se requieren endpoint y keys (p256dh, auth).',
    });
  }

  const { existed, total } = store.upsert(subscription);

  console.log(
    existed
      ? `Suscripción actualizada. Total activas: ${total}`
      : `Nueva suscripción registrada. Total activas: ${total}`
  );

  return res.status(existed ? 200 : 201).json({
    ok: true,
    message: existed
      ? 'Suscripción actualizada correctamente.'
      : 'Suscripción registrada correctamente.',
    totalSuscripciones: total,
  });
});

// Permite eliminar manualmente una suscripción por endpoint
app.post('/api/unsubscribe', (req, res) => {
  const { endpoint } = req.body ?? {};

  if (!endpoint || typeof endpoint !== 'string') {
    return res.status(400).json({
      ok: false,
      error: 'Se requiere el campo "endpoint".',
    });
  }

  const removed = store.removeByEndpoint(endpoint);

  return res.json({
    ok: true,
    removed,
    totalSuscripciones: store.size(),
  });
});

// Envía notificaciones Push compatibles con Angular Service Worker (ngsw-worker.js / SwPush)
app.post('/api/push', async (req, res) => {
  const { title, body, icon, badge, url, data } = req.body ?? {};

  const notificationTitle =
    typeof title === 'string' && title.trim().length > 0
      ? title.trim()
      : 'FakeStore PWA';
  const notificationBody =
    typeof body === 'string' && body.trim().length > 0
      ? body.trim()
      : 'Tienes una nueva notificación.';

  const targetUrl = typeof url === 'string' && url.trim().length > 0 ? url.trim() : '/';

  // Formato requerido por @angular/service-worker (ngsw-worker.js -> handlePush)
  const payload = JSON.stringify({
    notification: {
      title: notificationTitle,
      body: notificationBody,
      icon: icon || '/icons/icon-192x192.png',
      badge: badge || '/icons/icon-72x72.png',
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        url: targetUrl,
        onActionClick: {
          default: {
            operation: 'focusLastFocusedOrOpen',
            url: targetUrl,
          },
        },
        ...(data && typeof data === 'object' ? data : {}),
      },
    },
  });

  const subscriptions = store.getAll();

  if (subscriptions.length === 0) {
    return res.json({
      ok: true,
      enviadas: 0,
      fallidas: 0,
      eliminadas: 0,
      totalSuscripciones: 0,
      message: 'No hay suscripciones activas registradas.',
    });
  }

  let enviadas = 0;
  let fallidas = 0;
  let eliminadas = 0;

  const results = await Promise.allSettled(
    subscriptions.map((sub) => webpush.sendNotification(sub, payload))
  );

  results.forEach((result, index) => {
    const sub = subscriptions[index];

    if (result.status === 'fulfilled') {
      enviadas += 1;
      return;
    }

    fallidas += 1;
    const statusCode = result.reason?.statusCode;

    // 404 (Not Found) o 410 (Gone) indican que la suscripción expiró o fue revocada
    if (statusCode === 404 || statusCode === 410) {
      if (store.removeByEndpoint(sub.endpoint)) {
        eliminadas += 1;
      }
    }

    console.error(
      `Error enviando notificación (status=${statusCode ?? 'desconocido'}):`,
      result.reason?.body || result.reason?.message || result.reason
    );
  });

  console.log(
    `Push procesado "${notificationTitle}" -> enviadas=${enviadas}, fallidas=${fallidas}, eliminadas=${eliminadas}`
  );

  return res.json({
    ok: true,
    enviadas,
    fallidas,
    eliminadas,
    totalSuscripciones: store.size(),
  });
});

app.use((err, _req, res, _next) => {
  console.error('Error interno del servidor:', err);
  res.status(500).json({
    ok: false,
    error: 'Error interno del servidor Push.',
  });
});

app.listen(PORT, () => {
  console.log(`Servidor Web Push escuchando en http://localhost:${PORT}`);
  console.log(`Endpoints disponibles: POST /api/subscribe | POST /api/push | GET /api/health`);
});
