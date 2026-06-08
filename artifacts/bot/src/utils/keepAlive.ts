import { createServer } from "http";
import { Client } from "discord.js";

export function startKeepAlive(client: Client, port = 8080): void {
  const server = createServer((req, res) => {
    const isOnline = client.isReady();
    const tag = client.user?.tag ?? "Chicago Systems";
    const guilds = client.guilds?.cache.size ?? 0;
    const uptime = client.uptime ? formatUptime(client.uptime) : "—";
    const ping = client.ws.ping >= 0 ? `${client.ws.ping}ms` : "—";

    if (req.url === "/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ online: isOnline, tag, guilds, ping: client.ws.ping, uptime: client.uptime }));
      return;
    }

    const statusColor = isOnline ? "#57f287" : "#ed4245";
    const statusText = isOnline ? "EN LÍNEA" : "DESCONECTADO";
    const statusDot = isOnline ? "●" : "○";

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="30" />
  <title>Chicago Systems — Estado</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: #0d0d0f;
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 32px;
    }

    .card {
      background: #18181b;
      border: 1px solid #2a2a2e;
      border-radius: 16px;
      padding: 40px 48px;
      text-align: center;
      max-width: 420px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }

    .logo {
      font-size: 48px;
      margin-bottom: 12px;
    }

    .bot-name {
      font-size: 22px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 24px;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: ${isOnline ? "rgba(87,242,135,0.1)" : "rgba(237,66,69,0.1)"};
      border: 1px solid ${statusColor};
      border-radius: 999px;
      padding: 10px 24px;
      margin-bottom: 28px;
    }

    .dot {
      font-size: 22px;
      color: ${statusColor};
      ${isOnline ? "animation: pulse 2s infinite;" : ""}
    }

    .status-text {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 1px;
      color: ${statusColor};
    }

    .stats {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 12px;
      margin-top: 4px;
    }

    .stat {
      background: #222226;
      border-radius: 10px;
      padding: 12px 8px;
    }

    .stat-value {
      font-size: 18px;
      font-weight: 700;
      color: #ffffff;
    }

    .stat-label {
      font-size: 11px;
      color: #888;
      margin-top: 2px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .footer {
      font-size: 12px;
      color: #555;
      margin-top: 20px;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🏙️</div>
    <div class="bot-name">Chicago Systems</div>

    <div class="status-badge">
      <span class="dot">${statusDot}</span>
      <span class="status-text">${statusText}</span>
    </div>

    <div class="stats">
      <div class="stat">
        <div class="stat-value">${guilds}</div>
        <div class="stat-label">Servidores</div>
      </div>
      <div class="stat">
        <div class="stat-value">${ping}</div>
        <div class="stat-label">Ping</div>
      </div>
      <div class="stat">
        <div class="stat-value">${uptime}</div>
        <div class="stat-label">Uptime</div>
      </div>
    </div>

    <div class="footer">Actualiza cada 30 segundos · ${new Date().toLocaleTimeString("es-MX")}</div>
  </div>
</body>
</html>`;

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });

  server.listen(port, () => {
    console.info(`[keep-alive] Status page running on port ${port}`);
  });
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}
