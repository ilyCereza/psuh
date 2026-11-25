# Servidor Web Push para FakeStore PWA (Angular `SwPush`)

Servidor backend en Node.js + Express + `web-push` diseñado específicamente para la aplicación Angular PWA ubicada en `../pwa-angular`.

## Compatibilidad con el Frontend (`SwPush`)

El frontend (`pwa-angular/src/app/core/push-notification.ts`) utiliza el módulo `SwPush` de `@angular/service-worker` para:
1. Solicitar permiso de notificaciones al usuario (`Notification.requestPermission()`).
2. Capturar la suscripción del navegador mediante `swPush.requestSubscription({ serverPublicKey: VAPID_PUBLIC_KEY })`.
3. Enviarla por `HTTP POST` a `${PUSH_API_URL}/subscribe`.
4. Disparar notificaciones por `HTTP POST` a `${PUSH_API_URL}/push` esperando `{ enviadas: number }`.

Este servidor construye el payload en el formato `{ notification: { title, body, icon, badge, vibrate, data } }` requerido por `ngsw-worker.js` para mostrar notificaciones del sistema y abrir/enfocar la PWA al hacer clic.

## Endpoints

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/health` (y `/`) | Verificación de estado y total de suscripciones activas. |
| `GET` | `/api/vapid-public-key` | Devuelve la clave pública VAPID configurada. |
| `GET` | `/api/subscriptions` | Lista informativa de endpoints suscritos (sin llaves privadas). |
| `POST` | `/api/subscribe` | Recibe el objeto `PushSubscription` del navegador y lo guarda (sin duplicados). |
| `POST` | `/api/unsubscribe` | Elimina manualmente una suscripción por `{ endpoint }`. |
| `POST` | `/api/push` | Recibe `{ title, body }` y envía la notificación Push a todas las suscripciones activas, limpiando automáticamente las expiradas (`404`/`410`). Devuelve `{ ok, enviadas, fallidas, eliminadas, totalSuscripciones }`. |

## Ejecución local

1. Instalar dependencias (si no se han instalado):
   ```bash
   cd push-server
   npm install
   ```
2. Iniciar el servidor:
   ```bash
   npm start
   ```
   El servidor correrá en `http://localhost:3000` (API en `http://localhost:3000/api`).

> **Importante para probar la PWA Angular en local:**
> En `pwa-angular/src/app/app.config.ts`, el Service Worker se activa únicamente en modo producción (`enabled: !isDevMode()`). Para probar `SwPush` localmente:
> ```bash
> cd pwa-angular
> npm run build
> npx http-server dist/pwa/browser -p 8080 -c-1
> ```
> Luego abre `http://localhost:8080`, haz clic en **Activar avisos** y después en **Notificar**.

## Despliegue (Render, Railway, etc.)

El proyecto incluye `render.yaml` listo para desplegar en Render (u otro proveedor Node.js):

1. Sube la carpeta `push-server` a un repositorio Git (o configura `Root Directory: push-server`).
2. Configura los comandos:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
3. Define las variables de entorno en la plataforma:
   - `VAPID_PUBLIC_KEY`: misma clave pública configurada en `pwa-angular/src/app/core/push.config.ts`
   - `VAPID_PRIVATE_KEY`: clave privada generada en `.env`
   - `VAPID_SUBJECT`: `mailto:tu-correo@dominio.com`
   - `CORS_ORIGIN`: `*` (o el dominio exacto de tu frontend desplegado)
4. Una vez desplegado, actualiza únicamente `PUSH_API_URL` en `pwa-angular/src/app/core/push.config.ts`:
   ```ts
   export const PUSH_API_URL = 'https://tu-servidor-push.onrender.com/api';
   ```

## Regenerar claves VAPID (opcional)

Si deseas generar un nuevo par de claves:
```bash
npm run generate-vapid
```
Actualiza `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` en `.env` (y en tu hosting), y coloca la nueva `VAPID_PUBLIC_KEY` en `pwa-angular/src/app/core/push.config.ts`.
