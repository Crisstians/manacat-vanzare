import { io, type Socket } from "socket.io-client";
import { apiOrigin } from "../config";
import { getTicket, listEvents } from "../api/floorApi";
import type { FloorTicket, FloorTicketEvent } from "../api/types";

type Handlers = {
  onTicketEvent: (event: FloorTicketEvent) => void;
  onResync: (ticket: FloorTicket) => void;
  onConnection: (connected: boolean) => void;
};

export class TicketSocket {
  private socket: Socket | null = null;
  private seen = new Set<string>();
  private lastSeq = 0;
  private ticketId: string | null = null;
  private handlers: Handlers | null = null;

  connect(token: string, handlers: Handlers) {
    this.disconnect();
    this.handlers = handlers;
    this.socket = io(`${apiOrigin()}/floor`, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 8000,
    });

    this.socket.on("connect", () => {
      handlers.onConnection(true);
      if (this.ticketId) {
        this.joinTicket(this.ticketId, this.lastSeq);
      }
    });
    this.socket.on("disconnect", () => handlers.onConnection(false));
    this.socket.on("ticket.event", (event: FloorTicketEvent) => {
      void this.handleEvent(event);
    });
  }

  setTicket(ticketId: string | null, lastSeq = 0) {
    if (this.ticketId && this.ticketId !== ticketId && this.socket) {
      this.socket.emit("leave-ticket", this.ticketId);
    }
    this.ticketId = ticketId;
    this.lastSeq = lastSeq;
    this.seen.clear();
    if (ticketId) {
      this.joinTicket(ticketId, lastSeq);
    }
  }

  disconnect() {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.ticketId = null;
    this.seen.clear();
  }

  private joinTicket(ticketId: string, afterSeq: number) {
    this.socket?.emit(
      "join-ticket",
      { ticketId, afterSeq },
      (result: { ok?: boolean; resync?: boolean; events?: FloorTicketEvent[] }) => {
        if (result?.resync) {
          void this.resync(ticketId);
          return;
        }
        for (const event of result?.events ?? []) {
          void this.handleEvent(event);
        }
      },
    );
  }

  private async handleEvent(event: FloorTicketEvent) {
    if (this.seen.has(event.eventId)) return;
    if (event.seq <= this.lastSeq) return;

    if (this.ticketId && event.ticketId === this.ticketId && event.seq > this.lastSeq + 1) {
      const missed = await listEvents(event.ticketId, this.lastSeq);
      if (missed.length === 0 || missed[0]!.seq > this.lastSeq + 1) {
        await this.resync(event.ticketId);
        return;
      }
      for (const item of missed) {
        if (this.seen.has(item.eventId) || item.seq <= this.lastSeq) continue;
        this.seen.add(item.eventId);
        this.lastSeq = item.seq;
        this.handlers?.onTicketEvent(item);
      }
      return;
    }

    this.seen.add(event.eventId);
    this.lastSeq = event.seq;
    this.handlers?.onTicketEvent(event);
  }

  private async resync(ticketId: string) {
    const snapshot = await getTicket(ticketId);
    this.lastSeq = snapshot.lastSeq;
    this.seen.clear();
    this.handlers?.onResync(snapshot);
  }
}

export const ticketSocket = new TicketSocket();
