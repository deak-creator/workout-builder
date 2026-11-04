// Old address retired: clear the old app's offline copy, remove this worker and send open windows to the new address.
const NEW_URL = "https://deak-creator.github.io/workout-app/";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("workout-builder-")).map(k => caches.delete(k)));
    await self.registration.unregister();
    const wins = await self.clients.matchAll({ type: "window" });
    wins.forEach(c => c.navigate(NEW_URL));
  })());
});
