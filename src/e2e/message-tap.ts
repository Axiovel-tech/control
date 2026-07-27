/**
 * @file Records Flockwave traffic in both directions.
 *
 * This lets a test assert what the GUI actually asked the server to do, rather
 * than inferring it from a dialog that closed. It is installed by wrapping the
 * message hub's two choke points; the hub itself is left untouched so that
 * disabling the bridge removes the tap entirely.
 */

import type MessageHub from '~/flockwave/messages';

import type { MessageFilter, TappedMessage } from './types';

/**
 * How many messages to retain. Telemetry notifications (`UAV-INF`) arrive
 * several times a second, so an unbounded log would grow without limit during
 * a long session.
 */
const RING_CAPACITY = 2000;

const ring: TappedMessage[] = [];
let nextSeq = 1;

/**
 * Bodies the bridge injected, identified by object identity.
 *
 * The bridge's own `sendMessage()` goes through the same tapped hub, so without
 * this a test could seed a precondition with a message and then "observe" the
 * GUI sending it. Marking the body itself rather than flipping a module-level
 * flag around the call means the attribution cannot be thrown off by timing:
 * the tap is the outermost wrapper, so it sees the exact object the bridge
 * marked, whenever it gets around to recording it.
 */
const bridgeBodies = new WeakSet<object>();

/** Marks a message body as harness-injected, and returns it unchanged. */
export const markBridgeOrigin = <T>(body: T): T => {
  if (typeof body === 'object' && body !== null) {
    bridgeBodies.add(body);
  }

  return body;
};

/**
 * Deep-clones a message body so that later in-place mutation by the app cannot
 * rewrite what the test observed. Falls back to a marker when the body carries
 * something structured-clone cannot handle.
 */
const snapshot = (body: unknown): unknown => {
  try {
    return structuredClone(body);
  } catch {
    return { __unserializable: String(body) };
  }
};

/**
 * Extracts the Flockwave message type from a body.
 *
 * `sendMessage()` accepts either a body object or a bare type string — the hub
 * expands the latter into `{ type }` on the way out. Recording only the object
 * form would silently drop the type of every shorthand send, which is most of
 * the connection handshake.
 */
const typeOf = (body: unknown): string | undefined => {
  if (typeof body === 'string') {
    return body;
  }

  if (typeof body === 'object' && body !== null) {
    const { type } = body as { type?: unknown };
    return typeof type === 'string' ? type : undefined;
  }

  return undefined;
};

const record = (direction: 'out' | 'in', body: unknown): void => {
  ring.push({
    seq: nextSeq++,
    at: Date.now(),
    direction,
    // `WeakSet.has` is false for primitives, and an inbound body is never
    // marked, so neither case needs a guard of its own.
    origin: bridgeBodies.has(body as object) ? 'bridge' : 'app',
    type: typeOf(body),
    body: snapshot(body),
  });

  if (ring.length > RING_CAPACITY) {
    ring.splice(0, ring.length - RING_CAPACITY);
  }
};

/**
 * Wraps the message hub's send and receive paths so every message passing
 * through is recorded. Safe to call once per page load.
 */
export const installMessageTap = (hub: MessageHub): void => {
  const originalSendMessage = hub.sendMessage.bind(hub);
  const originalSendNotification = hub.sendNotification.bind(hub);
  const originalProcessIncoming = hub.processIncomingMessage.bind(hub);

  // Only record what actually leaves. Both send paths bail out when the hub has
  // no emitter — the normal state while disconnected — and `sendNotification`
  // does so silently. Recording regardless would let a test assert that the GUI
  // asked the server for something it never sent, which is the exact failure
  // this tap exists to catch.
  hub.sendMessage = async function sendMessage(body = {}, options) {
    if (hub.canSend()) {
      record('out', body);
    }

    return originalSendMessage(body, options);
  } as typeof hub.sendMessage;

  hub.sendNotification = function sendNotification(body = {}) {
    if (hub.canSend()) {
      record('out', body);
    }

    return originalSendNotification(body);
  };

  hub.processIncomingMessage = function processIncomingMessage(message) {
    record('in', message?.body);
    return originalProcessIncoming(message);
  };
};

/** Returns recorded messages, oldest first, narrowed by an optional filter. */
export const getMessages = (filter: MessageFilter = {}): TappedMessage[] => {
  const { type, direction, origin, since } = filter;
  return ring.filter(
    (message) =>
      (type === undefined || message.type === type) &&
      (direction === undefined || message.direction === direction) &&
      (origin === undefined || message.origin === origin) &&
      (since === undefined || message.seq > since)
  );
};

/**
 * Drops every recorded message.
 *
 * Sequence numbers keep counting: they are the cursor a `since` filter uses, so
 * restarting them would make a cursor held across a clear silently match
 * nothing.
 */
export const clearMessages = (): void => {
  ring.length = 0;
};
