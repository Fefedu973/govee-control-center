import http from 'node:http';

export function createHealthServer({ config, getStatus }) {
  const server = http.createServer((request, response) => {
    if (!['/healthz', '/readyz'].includes(request.url)) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end('{"error":"not_found"}\n');
      return;
    }

    const status = getStatus();
    const ready = status.ble.scanning && status.target.reachable;
    const code = request.url === '/readyz' && !ready ? 503 : 200;
    response.writeHead(code, {
      'cache-control': 'no-store',
      'content-type': 'application/json',
    });
    response.end(`${JSON.stringify({ ...status, ready })}\n`);
  });

  return {
    async start() {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.port, config.host, resolve);
      });
    },
    async stop() {
      if (!server.listening) return;
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
