self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)));
    }),
  );

  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // 开发阶段不拦截任何请求，全部走网络
  return;
});
