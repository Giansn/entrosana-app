/* Erzeugt von tools/services-snapshot.sh — nicht von Hand ändern. */
window.__services = {
 "host": "e14",
 "read": "2026-09-08 20:27",
 "services": [
  {"group":"Public","name":"entrosana.com","what":"WordPress","where":"via tunnel","state":"ok","status":"Up 3 weeks","origin":"entrosana"},
  {"group":"Public","name":"entrosana.app","what":"this app, entrosana-app.service","where":"via tunnel","state":"ok","status":"active","origin":"entrosana"},
  {"group":"Public","name":"entrosana-tunnel","what":"Cloudflare Tunnel, serves both hosts","where":"cloudflared","state":"ok","status":"active","origin":"entrosana"},
  {"group":"LAN and tailnet","name":"entrosana-site","what":"static predecessor, fallback path","where":"LAN","state":"ok","status":"active","origin":"entrosana"},
  {"group":"LAN and tailnet","name":"entrosana-edge","what":"Caddy TLS edge","where":"LAN","state":"ok","status":"Up 3 weeks","origin":"entrosana"},
  {"group":"LAN and tailnet","name":"entrosana-admin","what":"editor, tailnet only","where":"tailnet","state":"warn","status":"active","origin":"entrosana","flag":"Unit description and the actual listener disagree about the port."},
  {"group":"LAN and tailnet","name":"entrosana-staging","what":"staging preview, tailnet only","where":"tailnet","state":"ok","status":"active","origin":"entrosana"},
  {"group":"Data","name":"entrosana-wp-db-1","what":"MariaDB","where":"container only","state":"ok","status":"Up 3 weeks (healthy)","origin":"entrosana"},
  {"group":"Jobs","name":"entrosana-wp-backup","what":"db + wp-content + stack → local, T9, Nextcloud","where":"oneshot","state":"wait","status":"inactive","origin":"entrosana"}
 ]
};
