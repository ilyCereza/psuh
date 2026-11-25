import webpush from 'web-push';

const vapidKeys = webpush.generateVAPIDKeys();

console.log('Claves VAPID generadas correctamente:\n');
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}\n`);
console.log('Copia VAPID_PUBLIC_KEY en pwa-angular/src/app/core/push.config.ts');
console.log('y ambas claves en push-server/.env (o variables de entorno en tu hosting).');
