<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
<title>Vestidor</title>
<meta name="description" content="Tu vestidor y tus outfits diarios" />

<!-- PWA -->
<link rel="manifest" href="manifest.json" />
<meta name="theme-color" content="#0B0B0D" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Vestidor" />
<link rel="apple-touch-icon" href="icons/icon-192.png" />
<link rel="icon" href="icons/icon-192.png" />

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

<link rel="stylesheet" href="css/style.css" />
</head>
<body>
<div id="app">
  <header id="topbar">
    <button id="btn-open-settings" class="icon-btn" aria-label="Configuración">
      <svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    </button>
    <div id="topbar-title">VESTIDOR</div>
    <span class="icon-btn-spacer"></span>
  </header>

  <main id="view"></main>

  <aside id="settings-drawer" class="drawer hidden">
    <div class="drawer-backdrop" id="drawer-backdrop"></div>
    <div class="drawer-panel">
      <div class="drawer-header">
        <span class="drawer-title">CONFIGURACIÓN</span>
        <button id="btn-close-settings" class="icon-btn" aria-label="Cerrar">
          <svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div id="drawer-content"></div>
    </div>
  </aside>

  <div id="modal-root"></div>
  <div id="toast-root"></div>
</div>

<script type="module" src="js/app.js"></script>
</body>
</html>
