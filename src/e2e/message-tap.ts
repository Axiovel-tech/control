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

const record = (direction: 'out' | 'in', body: unknown): void => {
  const type =
    typeof body === 'object' && body !== null
      ? (body as { type?: unknown }).type
      : undefined;

  ring.push({
    seq: nextSeq++,
    at: Date.now(),
    direction,
    type: typeof type === 'string' ? type : undefined,
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

  hub.sendMessage = async function sendMessage(body = {}, options) {
    record('out', body);
    return originalSendMessage(body, options);
  } as typeof hub.sendMessage;

  hub.sendNotification = function sendNotification(body = {}) {
    record('out', body);
    return originalSendNotification(body);
  };

  hub.processIncomingMessage = function processIncomingMessage(message) {
    record('in', message?.body);
    return originalProcessIncoming(message);
  };
};

/** Returns recorded messages, oldest first, narrowed by an optional filter. */
export const getMessages = (filter: MessageFilter = {}): TappedMessage[] => {
  const { type, direction, since } = filter;
  return ring.filter(
    (message) =>
      (type === undefined || message.type === type) &&
      (direction === undefined || message.direction === direction) &&
      (since === undefined || message.seq > since)
  );
};

/** Drops every recorded message and restarts the sequence numbering. */
export const clearMessages = (): void => {
  ring.length = 0;
  nextSeq = 1;
};
