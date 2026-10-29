self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", event => {
  let data = { title: "Reminder", body: "" };
  try { if (event.data) data = event.data.json(); } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title || "Reminder", {
      body: data.body || "",
      tag: data.id || "reminder",
      requireInteraction: true,
      vibrate: [200, 100, 200],
      data: { url: "/" }
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.location.host) && "focus" in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow("/");
    })
  );
});
