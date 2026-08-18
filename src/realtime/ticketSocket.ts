import { io, type Socket } from "socket.io-client";
import { apiOrigin } from "../config";
import { getTicket, listEvents } from "../api/floorApi";
import type { FloorTicket, FloorTicketEvent } from "../api/types";

type Handlers = {
  onTicketEvent: (event: FloorTicketEvent) => void;
  onResync: (ticket: FloorTicket) => void;
  onConnection: (connected: boolean) => void;
  onReconnect: () => void;
};

export class TicketSocket {
  private socket: Socket | null = null;
  private seenByTicket = new Map<string, Set<string>>();
  private lastSeqByTicket = new Map<string, number>();
  private ticketId: string | null = null;
  private storeId: string | null = null;
  private handlers: Handlers | null = null;
  private chain: Promise<void> = Promise.resolve();

  connect(token: string, storeId: string, handlers: Handlers) {
    this.disconnect();
    this.handlers = handlers;
    this.storeId = storeId;
    this.socket = io(`${apiOrigin()}/floor`, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 300,
      reconnectionDelayMax: 8000,
    });

    this.socket.on("connect", () => {
      handlers.onConnection(true);
      if (this.storeId) {
        this.socket?.emit("join-store", this.storeId);
      }
      if (this.ticketId) {
        this.joinTicket(this.ticketId, this.lastSeqFor(this.ticketId));
      }
      handlers.onReconnect();
    });
    this.socket.on("disconnect", () => handlers.onConnection(false));
    this.socket.on("ticket.event", (event: FloorTicketEvent) => {
      this.enqueue(() => this.handleEvent(event));
    });
  }

  setTicket(ticketId: string | null, lastSeq = 0) {
    if (this.ticketId && this.ticketId !== ticketId && this.socket) {
      this.socket.emit("leave-ticket", this.ticketId);
    }
    this.ticketId = ticketId;
    if (ticketId) {
      this.lastSeqByTicket.set(ticketId, lastSeq);
      this.seenFor(ticketId).clear();
      this.joinTicket(ticketId, lastSeq);
    }
  }

  noteSeq(ticketId: string, seq: number) {
    const current = this.lastSeqByTicket.get(ticketId) ?? 0;
    if (seq > current) this.lastSeqByTicket.set(ticketId, seq);
  }

  disconnect() {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.ticketId = null;
    this.storeId = null;
    this.handlers = null;
    this.seenByTicket.clear();
    this.lastSeqByTicket.clear();
    this.chain = Promise.resolve();
  }

  private lastSeqFor(ticketId: string): number {
    return this.lastSeqByTicket.get(ticketId) ?? 0;
  }

  private seenFor(ticketId: string): Set<string> {
    let seen = this.seenByTicket.get(ticketId);
    if (!seen) {
      seen = new Set();
      this.seenByTicket.set(ticketId, seen);
    }
    return seen;
  }

  private enqueue(work: () => Promise<void>) {
    this.chain = this.chain.then(work).catch(() => undefined);
  }

  private joinTicket(ticketId: string, afterSeq: number) {
    this.socket?.emit(
      "join-ticket",
      { ticketId, afterSeq },
      (result: { ok?: boolean; resync?: boolean; events?: FloorTicketEvent[] }) => {
        if (result?.resync) {
          this.enqueue(() => this.resync(ticketId));
          return;
        }
        for (const event of result?.events ?? []) {
          this.enqueue(() => this.handleEvent(event));
        }
      },
    );
  }

  private async handleEvent(event: FloorTicketEvent) {
    const seen = this.seenFor(event.ticketId);
    if (seen.has(event.eventId)) return;

    const lastSeq = this.lastSeqFor(event.ticketId);
    if (event.seq <= lastSeq) return;

    if (this.ticketId && event.ticketId === this.ticketId && event.seq > lastSeq + 1) {
      const missed = await listEvents(event.ticketId, lastSeq);
      if (missed.length === 0 || missed[0]!.seq > lastSeq + 1) {
        await this.resync(event.ticketId);
        return;
      }
      for (const item of missed) {
        const itemSeen = this.seenFor(item.ticketId);
        const itemLast = this.lastSeqFor(item.ticketId);
        if (itemSeen.has(item.eventId) || item.seq <= itemLast) continue;
        itemSeen.add(item.eventId);
        this.lastSeqByTicket.set(item.ticketId, item.seq);
        this.handlers?.onTicketEvent(item);
      }
      return;
    }

    seen.add(event.eventId);
    this.lastSeqByTicket.set(event.ticketId, event.seq);
    this.handlers?.onTicketEvent(event);
  }

  private async resync(ticketId: string) {
    const snapshot = await getTicket(ticketId);
    this.lastSeqByTicket.set(ticketId, snapshot.lastSeq);
    this.seenFor(ticketId).clear();
    this.handlers?.onResync(snapshot);
  }
}

export const ticketSocket = new TicketSocket();
