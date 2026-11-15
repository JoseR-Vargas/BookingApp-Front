// Preloaded into the E2E backend (`node --require`): any TCP connection to a non-loopback host fails.
// Defense in depth so no email (SMTP) or WhatsApp (HTTPS) call can leave the machine, whatever the env says.
const net = require('node:net');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '::']);
const originalConnect = net.Socket.prototype.connect;

function targetHost(args) {
  let first = args[0];
  if (Array.isArray(first)) first = first[0]; // already-normalized arguments: [options, callback]
  if (first && typeof first === 'object') {
    if (first.path) return null; // unix socket
    return first.host || 'localhost';
  }
  if (typeof first === 'string' && Number.isNaN(Number(first))) return null; // unix socket path
  return typeof args[1] === 'string' ? args[1] : 'localhost';
}

net.Socket.prototype.connect = function blockedConnect(...args) {
  const host = targetHost(args);
  if (host !== null && !LOCAL_HOSTS.has(host)) {
    const error = new Error(`[e2e] outbound connection to "${host}" is blocked`);
    process.nextTick(() => this.destroy(error));
    return this;
  }
  return originalConnect.apply(this, args);
};
