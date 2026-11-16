// Installs the service worker that makes Touchline work offline, and offers a reload when a new
// version has been downloaded. The worker never takes over by itself: reloading mid-match is the
// player's call, not ours.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    let reg, updating = false;
    try { reg = await navigator.serviceWorker.register('sw.js'); } catch { return; } // no sw.js outside a build
    const offer = worker => {
      if (document.getElementById('update')) return;
      const b = document.createElement('button');
      b.id = 'update'; b.className = 'primary'; b.textContent = 'New version ready — reload';
      b.onclick = () => { updating = true; worker.postMessage('skipWaiting'); };
      document.body.append(b);
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
    // Only reload for an update the player asked for; the first install also changes the controller.
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (updating) { updating = false; location.reload(); } });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  });
}
