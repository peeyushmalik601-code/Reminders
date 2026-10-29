const CACHE_NAME = 'reminder-pwa-v3';
const ASSETS = ['/', '/index.html', '/manifest.json'];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener("activate", e => {
  e.waitUntil(self.clients.claim());
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.map(k => { if (k !== CACHE_NAME) return caches.delete(k); })
  )));
});

self.addEventListener("fetch", e => {
  if (e.request.method === 'GET') {
    e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
  }
});

// === PUSH NOTIFICATION LOGIC ===
self.addEventListener("push", event => {
  let data = { title: "Reminder", body: "" };
  try { if (event.data) data = event.data.json(); } catch (e) {}
  
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.id,
      requireInteraction: true,
      vibrate: data.vibrate || [200, 100, 200],
      data: { id: data.id },
      actions: data.actions || [],
      // === NAYA: Icon aur Badge yahan add kiya hai ===
      icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj48cmVjdCB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgcng9IjEwMCIgZmlsbD0iIzhiNWNmNiIvPjx0ZXh0IHg9IjI1NiIgeT0iMjU2IiBmb250LXNpemU9IjI1MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9ImNlbnRyYWwiPvCfkqU8L3RleHQ+PC9zdmc+',
      badge: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj48cmVjdCB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgcng9IjEwMCIgZmlsbD0iIzhiNWNmNiIvPjx0ZXh0IHg9IjI1NiIgeT0iMjU2IiBmb250LXNpemU9IjI1MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9ImNlbnRyYWwiPvCfkqU8L3RleHQ+PC9zdmc+'
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const action = event.action;
  const id = event.notification.data.id;

  if (action === "snooze") {
    event.waitUntil(fetch(`/api/snooze/${id}`, { method: "POST" }));
    return;
  }
  
  if (action === "done") {
    event.waitUntil(fetch(`/api/reminders/${id}`, { 
      method: "PUT", 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fired: true }) 
    }));
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.location.host) && "focus" in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow("/");
    })
  );
});
