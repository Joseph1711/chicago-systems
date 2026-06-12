import threading
import time
from flask import Flask, jsonify

app = Flask(__name__)
_bot_ref = None

def set_bot(bot):
    global _bot_ref
    _bot_ref = bot

def format_uptime(seconds):
    if seconds < 3600:
        return f"{int(seconds // 60)}m"
    if seconds < 86400:
        return f"{int(seconds // 3600)}h"
    return f"{int(seconds // 86400)}d"

@app.route("/")
def home():
    return "Bot is running"

@app.route("/dashboard")
def dashboard():
    bot = _bot_ref
    if bot and bot.is_ready():
        status = "EN LÍNEA"
        guilds = len(bot.guilds)
        ping = round(bot.latency * 1000)
        uptime = format_uptime(time.time() - bot.start_time) if hasattr(bot, "start_time") else "N/A"
    else:
        status = "DESCONECTADO"
        guilds = 0
        ping = 0
        uptime = "N/A"
    html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="30">
  <title>Chicago Systems Bot</title>
  <style>
    body{{background:#0d0d0f;color:#e0e0e0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}}
    .card{{background:#1a1a1f;border-radius:12px;padding:32px 48px;box-shadow:0 4px 32px #0008;min-width:320px;text-align:center}}
    h1{{color:#7289da;margin-bottom:8px}}
    .status{{font-size:1.2em;font-weight:bold;color:{'#43b581' if status=='EN LÍNEA' else '#f04747'}}}
    .row{{display:flex;justify-content:space-between;margin-top:16px;gap:24px}}
    .stat{{flex:1;background:#0d0d0f;border-radius:8px;padding:12px}}
    .stat-label{{font-size:0.75em;color:#888;text-transform:uppercase}}
    .stat-value{{font-size:1.3em;font-weight:bold;color:#e0e0e0}}
  </style>
</head>
<body>
  <div class="card">
    <h1>🤖 Chicago Systems</h1>
    <div class="status">{status}</div>
    <div class="row">
      <div class="stat"><div class="stat-label">Servidores</div><div class="stat-value">{guilds}</div></div>
      <div class="stat"><div class="stat-label">Ping</div><div class="stat-value">{ping}ms</div></div>
      <div class="stat"><div class="stat-label">Uptime</div><div class="stat-value">{uptime}</div></div>
    </div>
  </div>
</body>
</html>"""
    return html

@app.route("/status")
def status():
    bot = _bot_ref
    if bot and bot.is_ready():
        return jsonify({
            "online": True,
            "tag": str(bot.user),
            "guilds": len(bot.guilds),
            "ping": round(bot.latency * 1000),
            "uptime": time.time() - bot.start_time if hasattr(bot, "start_time") else 0,
        })
    return jsonify({"online": False})

def keep_alive():
    thread = threading.Thread(target=lambda: app.run(host="0.0.0.0", port=3000, use_reloader=False))
    thread.daemon = True
    thread.start()
