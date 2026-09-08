import { describe, it, expect, afterEach } from 'vitest';
import { createSignalingServer } from '../../server/server.js';

describe('production static serving', () => {
  let httpServer;

  afterEach(async () => {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
      httpServer = null;
    }
  });

  const start = async (serveStatic) => {
    const { server } = createSignalingServer({ serveStatic });
    httpServer = server;
    const port = await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    });
    return `http://127.0.0.1:${port}`;
  };

  it('отдаёт index.html и ассеты клиента при serveStatic=true', async () => {
    const base = await start(true);

    const index = await fetch(`${base}/`);
    expect(index.status).toBe(200);
    const indexBody = await index.text();
    expect(indexBody).toContain('VideoCall');

    const mainJs = await fetch(`${base}/main.js`);
    expect(mainJs.status).toBe(200);

    // SPA fallback: неизвестный путь отдаёт index.html
    const fallback = await fetch(`${base}/some/unknown/route`);
    expect(fallback.status).toBe(200);
    expect((await fallback.text())).toContain('VideoCall');
  });

  it('не отдаёт статику при serveStatic=false', async () => {
    const base = await start(false);
    const response = await fetch(`${base}/`);
    expect(response.status).toBe(404);
  });
});
