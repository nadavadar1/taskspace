/* Service worker for Web Push delivery. Intentionally tiny: no offline caching, just push. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "מרחב", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "מרחב";
  const options = {
    body: data.body || "",
    tag: data.tag,
    icon: "/icon",
    badge: "/icon",
    dir: "rtl",
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (list.length && "focus" in list[0]) {
        list[0].navigate(url);
        return list[0].focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
