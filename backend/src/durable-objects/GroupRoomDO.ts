import { DurableObject } from 'cloudflare:workers';
import type { RealtimeMessage } from '@tinhtien/shared';

export class GroupRoomDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    // Heartbeat "ping" được Cloudflare tự trả "pong" mà KHÔNG đánh thức Durable Object
    // (không tính phí duration, room vẫn ngủ đông giữa các sự kiện).
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/websocket') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
      }

      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);

      const memberId = url.searchParams.get('memberId') || 'anonymous';
      this.ctx.acceptWebSocket(server, [memberId]);

      return new Response(null, {
        status: 101,
        webSocket: client
      });
    }

    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const message: RealtimeMessage = await request.json();
      this.broadcast(message);
      return new Response(JSON.stringify({ success: true, count: this.ctx.getWebSockets().length }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not found', { status: 404 });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    // Client cũ (trước khi cập nhật) còn gửi ping dạng JSON -> vẫn trả lời để không bị ngắt
    try {
      const data = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
      }
    } catch {
      // Bỏ qua tin nhắn không đúng định dạng
    }
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code, reason);
    } catch {
      // đã đóng
    }
  }

  webSocketError(ws: WebSocket, error: unknown): void {
    try {
      ws.close(1011, 'WebSocket error occurred');
    } catch {
      // Ignore
    }
  }

  private broadcast(message: RealtimeMessage): void {
    const payload = JSON.stringify(message);
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      try {
        ws.send(payload);
      } catch {
        // Socket closed or failed
      }
    }
  }
}
