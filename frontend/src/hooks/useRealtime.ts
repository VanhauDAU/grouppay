import { useEffect, useRef, useState, useCallback } from 'react';
import type { RealtimeMessage } from '@tinhtien/shared';

export function useRealtime(
  groupCode: string | null,
  memberId: string | null,
  onEvent?: (event: RealtimeMessage) => void
) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (!groupCode) return;

    if (wsRef.current) {
      wsRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const mIdParam = memberId ? `?memberId=${encodeURIComponent(memberId)}` : '';
    const wsUrl = `${protocol}//${host}/api/groups/${groupCode}/ws${mIdParam}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.eventType && onEventRef.current) {
            onEventRef.current(data);
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        // Auto reconnect sau 3 giây
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = () => {
        setIsConnected(false);
        ws.close();
      };
    } catch {
      setIsConnected(false);
    }
  }, [groupCode, memberId]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { isConnected };
}
