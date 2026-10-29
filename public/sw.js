self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", event => {
  let data = { title: "Reminder", body: "" };
  try { if (event.data) data = event.data.json(); } catch (e) {}
  
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.id,
      requireInteraction: true,
      vibrate: data.vibrate || [200, 100, 200], // Default vibration if missing
      data: { id: data.id },
      actions: data.actions || []
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const action = event.action;
  const id = event.notification.data.id;

  if (action === "snooze") {
    // Call API to snooze
    event.waitUntil(fetch(`/api/snooze/${id}`, { method: "POST" }));
    return;
  }
  
  if (action === "done") {
    // Mark as done
    event.waitUntil(fetch(`/api/reminders/${id}`, { 
      method: "PUT", 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fired: true }) 
    }));
    return;
  }

  // Default click: open app
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.location.host) && "focus" in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow("/");
    })
  );
});
