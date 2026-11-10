/**
 * In-memory linked MCP transport for unit and integration testing
 */
export class InMemoryTransport {
  constructor() {
    this.peer = null;
    this.onmessage = undefined;
    this.onclose = undefined;
    this.onerror = undefined;
    this.started = false;
  }

  static createLinkedPair() {
    const a = new InMemoryTransport();
    const b = new InMemoryTransport();
    a.peer = b;
    b.peer = a;
    return [a, b];
  }

  async start() {
    this.started = true;
  }

  async send(message) {
    if (!this.peer || !this.started) {
      throw new Error("Transport not started or not linked to peer");
    }
    // Deliver asynchronously
    queueMicrotask(() => {
      if (this.peer?.onmessage) {
        this.peer.onmessage(JSON.parse(JSON.stringify(message)));
      }
    });
  }

  async close() {
    this.started = false;
    if (this.onclose) this.onclose();
    if (this.peer && this.peer.started) {
      this.peer.started = false;
      if (this.peer.onclose) this.peer.onclose();
    }
  }
}
