import { createServer } from 'node:http';

import { Server } from 'socket.io';

const port = Number(process.env.CONTROL_E2E_FIXTURE_PORT ?? 15000);
const requests = [];
let nextMessageId = 1;

const devices = {
  199: {
    name: 'tag-alpha',
    role: 'tag',
    online: true,
    address: '127.0.0.1',
    age: 0.1,
    firmwareVersion: 'e2e-fixture',
    paramCount: 3,
    sleeping: false,
    uav: 'drone-1',
  },
  200: {
    name: 'anchor-a0',
    role: 'anchor-initiator',
    online: true,
    address: '127.0.0.1',
    age: 0.1,
    firmwareVersion: 'e2e-fixture',
    paramCount: 2,
    twr: [{ peerMac: 2, distanceM: 14.14, ageMs: 25 }],
  },
};

const anchors = [
  {
    id: 'rtls::main::anchor_0',
    cell: 'main',
    index: 0,
    mac: 1,
    ned: { north: -5, east: -5, down: 0 },
    active: true,
  },
];

const stats = {
  199: {
    batteryVoltage: 4.12,
    solveRateHz: 20,
    solvePct: 99,
    anchorsSeen: 8,
    fixAgeMs: 12,
    clockPpm: 0.25,
    anchorMask: 255,
  },
};

const params = {
  UWB_ROLE: { value: 1, type: 'uint8', index: 0 },
  UWB_CELL_ID: { value: 1, type: 'uint16', index: 1 },
  WIFI_SSID: { value: 'fixture-network', type: 'custom', index: 2 },
};

const responseBodyFor = (body) => {
  const type = body?.type;
  switch (type) {
    case 'SYS-VER':
      return { type, version: 'control-e2e-fixture' };
    case 'SYS-TIME':
      return { type, timestamp: Date.now() };
    case 'SYS-PORTS':
      return { type, ports: { http: port } };
    case 'CONN-LIST':
    case 'CLK-LIST':
    case 'OBJ-LIST':
      return { type, ids: [] };
    case 'CONN-INF':
    case 'CLK-INF':
      return { type, status: {} };
    case 'EXT-LIST':
      return { type, loaded: ['rtls'], available: ['rtls'] };
    case 'LCN-INF':
      return { type, license: {} };
    case 'X-MSN-TYPE-LIST':
      return { type, ids: ['fixture-plan'] };
    case 'X-MSN-TYPE-INF':
      return {
        type,
        items: {
          'fixture-plan': {
            id: 'fixture-plan',
            name: 'Fixture plan',
            description: 'Deterministic standalone test mission',
            features: ['plan'],
          },
        },
      };
    case 'DEV-LISTSUB':
      return { type, paths: [] };
    case 'DEV-SUB':
    case 'DEV-UNSUB':
      return { type, success: body.paths ?? [], error: {} };
    case 'DEV-INF':
      return { type, values: {} };
    case 'X-RTLS-INF':
      return { type, status: devices, anchors };
    case 'X-RTLS-STATS':
      return { type, stats };
    case 'X-RTLS-POS':
      return {
        type,
        positions: {
          199: {
            north: 0.5,
            east: -0.25,
            down: -1.5,
            sigma: 0.03,
            ageMs: 10,
          },
        },
      };
    case 'X-RTLS-PARAM-LIST':
      return { type, id: String(body.id), params };
    default:
      // Unknown messages deliberately receive only their matching type. The
      // fixture is a UI seam, not a second implementation of axio-server.
      return { type };
  }
};

const httpServer = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`);

  if (request.method === 'GET' && url.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/__fixture/requests') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(requests));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__fixture/reset') {
    requests.length = 0;
    response.writeHead(204);
    response.end();
    return;
  }

  response.writeHead(404);
  response.end();
});

const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
  transports: ['websocket'],
});

io.on('connection', (socket) => {
  socket.on('fw', (message) => {
    const body = message?.body ?? {};
    requests.push({
      at: new Date().toISOString(),
      body,
    });
    socket.emit('fw', {
      '$fw.version': message?.['$fw.version'] ?? '1.0',
      id: `fixture-${nextMessageId++}`,
      refs: message?.id,
      body: responseBodyFor(body),
    });
  });
});

httpServer.listen(port, '::', () => {
  console.log(`control e2e fixture listening on http://localhost:${port}`);
});

const shutdown = () => {
  io.close(() => httpServer.close(() => process.exit(0)));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
