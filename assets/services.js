/* Erzeugt von tools/services-snapshot.sh — nicht von Hand ändern. */
window.__services = {
 "host": "e14",
 "read": "04:09",
 "services": [
  {"group":"Public","name":"entrosana.com","what":"WordPress","where":"via tunnel","state":"ok","status":"Up 7 hours"},
  {"group":"Public","name":"entrosana.app","what":"this app, entrosana-app.service","where":"via tunnel","state":"ok","status":"active"},
  {"group":"Public","name":"entrosana-tunnel","what":"Cloudflare Tunnel, serves both hosts","where":"cloudflared","state":"ok","status":"active"},
  {"group":"LAN and tailnet","name":"entrosana-site","what":"static predecessor, fallback path","where":"LAN","state":"ok","status":"active"},
  {"group":"LAN and tailnet","name":"entrosana-edge","what":"Caddy TLS edge","where":"LAN","state":"ok","status":"Up 2 weeks"},
  {"group":"LAN and tailnet","name":"entrosana-admin","what":"editor, tailnet only","where":"tailnet","state":"ok","status":"active"},
  {"group":"LAN and tailnet","name":"entrosana-staging","what":"staging preview, tailnet only","where":"tailnet","state":"ok","status":"active"},
  {"group":"Data","name":"entrosana-wp-db-1","what":"MariaDB","where":"container only","state":"ok","status":"Up 6 days (healthy)"},
  {"group":"Jobs","name":"entrosana-wp-backup","what":"db + wp-content + stack → local, T9, Nextcloud","where":"oneshot","state":"wait","status":"inactive"}
 ]
};
