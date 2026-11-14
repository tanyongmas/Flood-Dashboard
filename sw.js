/**
 * Service Worker สำหรับระบบเฝ้าน้ำหยงมัส (PWA)
 * กลยุทธ์: Network-First สำหรับหน้าเว็บภายใน เพื่อไม่ให้ข้อมูลระดับน้ำ/ประกาศค้างของเก่า
 * และไม่ดักจับ Request ภายนอก (Supabase, GAS, ThaiWater, Map Tiles, CDN)
 */

const CACHE_NAME = 'flood-dashboard-pwa-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './css/main.css',
  './assets/icon-pwa.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // ปล่อยผ่าน Request ภายนอกทั้งหมด (Supabase, GAS, ThaiWater, CDN, Map Tiles)
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
          const cloned = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, cloned)).catch(() => {});
        }
        return networkRes;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});

