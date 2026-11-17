import { useEffect, useRef, useState, useCallback } from 'react';
import type { RealtimeMessage } from '@tinhtien/shared';

export interface UseRealtimeOptions {
  onEvent?: (event: RealtimeMessage) => void;
  onWakeup?: () => void;
}

export function useRealtime(
  groupCode: string | null,
  memberId: string | null,
  options?: UseRealtimeOptions | ((event: RealtimeMessage) => void)
) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const pingIntervalRef = useRef<any>(null);
  const fallbackPollRef = useRef<any>(null);
  const reconnectAttemptsRef = useRef(0);

  // Chuẩn hóa options: hỗ trợ cả function hoặc object config
  const onEvent = typeof options === 'function' ? options : options?.onEvent;
  const onWakeup = typeof options === 'object' ? options?.onWakeup : undefined;

  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const onWakeupRef = useRef(onWakeup);
  onWakeupRef.current = onWakeup;

  const clearTimers = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  };

  const connect = useCallback(() => {
    if (!groupCode) return;

    clearTimers();

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
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
        reconnectAttemptsRef.current = 0;

        // Bắt đầu heartbeat ping mỗi 15s để giữ kết nối trên iOS Safari & carrier NAT
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            } catch {
              // ignore
            }
          }
        }, 15000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'pong' || data.type === 'connected') {
            return;
          }
          if (data.eventType && onEventRef.current) {
            onEventRef.current(data);
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

        // Exponential backoff reconnect: 1s, 2s, 3s, tối đa 5s
        reconnectAttemptsRef.current += 1;
        const delay = Math.min(reconnectAttemptsRef.current * 1000, 5000);
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      };

      ws.onerror = () => {
        setIsConnected(false);
        try {
          ws.close();
        } catch {
          // ignore
        }
      };
    } catch {
      setIsConnected(false);
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    }
  }, [groupCode, memberId]);

  // Listener khi quay lại tab / mở khóa màn hình / online trở lại
  useEffect(() => {
    const handleWakeup = () => {
      if (document.visibilityState === 'visible') {
        // Tức tốc refresh dữ liệu khi người dùng mở lại điện thoại
        onWakeupRef.current?.();

        // Nếu socket chưa OPEN, kết nối lại ngay lập tức không cần chờ timer
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          reconnectAttemptsRef.current = 0;
          connect();
        }
      }
    };

    const handleOnline = () => {
      onWakeupRef.current?.();
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connect();
      }
    };

    document.addEventListener('visibilitychange', handleWakeup);
    window.addEventListener('focus', handleWakeup);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleWakeup);
      window.removeEventListener('focus', handleWakeup);
      window.removeEventListener('online', handleOnline);
    };
  }, [connect]);

  // Fallback Polling tối ưu Cloudflare Free:
  // - Khi WebSocket đã kết nối: 0 request poll (Durable Objects tự push tức thì khi có biến động)
  // - Khi WebSocket mất kết nối: chỉ poll mỗi 20s và chỉ khi người dùng đang mở tab
  useEffect(() => {
    if (!groupCode || isConnected) {
      if (fallbackPollRef.current) {
        clearInterval(fallbackPollRef.current);
        fallbackPollRef.current = null;
      }
      return;
    }

    fallbackPollRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        onWakeupRef.current?.();
      }
    }, 20000);

    return () => {
      if (fallbackPollRef.current) {
        clearInterval(fallbackPollRef.current);
        fallbackPollRef.current = null;
      }
    };
  }, [groupCode, isConnected]);

  useEffect(() => {
    connect();

    return () => {
      clearTimers();
      if (fallbackPollRef.current) clearInterval(fallbackPollRef.current);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
      }
    };
  }, [connect]);

  return { isConnected, reconnect: connect };
}
