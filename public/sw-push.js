// CUE lead-alert service worker — displays Web Push notifications for new
// pilot requests and opens the scan-lead inbox when tapped.
self.addEventListener("push", (event) => {
  let data = { title: "CUE — new pilot request", body: "Open the scan-lead inbox to follow up.", url: "/pipeline/scan-leads" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_) {
    /* payload was plain text; keep defaults */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: "cue-pilot-request",
      renotify: true,
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/pipeline/scan-leads";
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});
