import { useEffect, useRef, useState, useCallback } from 'react';
import type { RealtimeMessage } from '@tinhtien/shared';

export interface UseRealtimeOptions {
  onEvent?: (event: RealtimeMessage) => void;
  onWakeup?: () => void;
}

// Heartbeat dạng chuỗi "ping" cố định: Durable Object tự trả "pong" mà không bị đánh thức (không tốn phí).
const PING_INTERVAL_MS = 25_000;
// Chỉ đồng bộ lại khi quay lại app sau khoảng ẩn đủ lâu (tránh 2-3 request mỗi lần chuyển tab)
const WAKEUP_MIN_HIDDEN_MS = 15_000;
const WAKEUP_THROTTLE_MS = 5_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

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
  const hiddenAtRef = useRef<number | null>(null);
  const lastWakeupRef = useRef(0);
  const missedWhileDisconnectedRef = useRef(false);

  const onEvent = typeof options === 'function' ? options : options?.onEvent;
  const onWakeup = typeof options === 'object' ? options?.onWakeup : undefined;

  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onWakeupRef = useRef(onWakeup);
  onWakeupRef.current = onWakeup;

  const triggerWakeup = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastWakeupRef.current < WAKEUP_THROTTLE_MS) return;
    lastWakeupRef.current = now;
    onWakeupRef.current?.();
  }, []);

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
      const old = wsRef.current;
      old.onclose = null;
      old.onerror = null;
      old.onmessage = null;
      try {
        old.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }

    const mIdParam = memberId ? `?memberId=${encodeURIComponent(memberId)}` : '';
    const apiUrl = import.meta.env.VITE_API_URL;
    let host = window.location.host;
    let secure = window.location.protocol === 'https:';
    if (apiUrl) {
      try {
        const u = new URL(apiUrl);
        host = u.host;
        secure = u.protocol === 'https:';
      } catch {
        // dùng host hiện tại
      }
    }
    const wsUrl = `${secure ? 'wss:' : 'ws:'}//${host}/api/groups/${groupCode}/ws${mIdParam}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        const wasReconnect = reconnectAttemptsRef.current > 0 || missedWhileDisconnectedRef.current;
        reconnectAttemptsRef.current = 0;
        // Có thể đã lỡ sự kiện trong lúc mất kết nối -> đồng bộ bù đúng 1 lần
        if (wasReconnect) {
          missedWhileDisconnectedRef.current = false;
          triggerWakeup(true);
        }

        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send('ping');
            } catch {
              // ignore
            }
          }
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        if (event.data === 'pong') return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'pong' || data.type === 'connected') return;
          if (data.eventType && onEventRef.current) onEventRef.current(data);
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        missedWhileDisconnectedRef.current = true;
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

        // Không cố kết nối lại khi app đang ẩn / offline: tránh đốt request nền vô ích.
        // Sẽ kết nối lại ngay khi người dùng quay lại (visibilitychange / online).
        if (document.visibilityState !== 'visible' || !navigator.onLine) return;

        reconnectAttemptsRef.current += 1;
        const delay = Math.min(1000 * 2 ** (reconnectAttemptsRef.current - 1), MAX_RECONNECT_DELAY_MS);
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          // ignore
        }
      };
    } catch {
      setIsConnected(false);
      reconnectTimeoutRef.current = setTimeout(connect, 5000);
    }
  }, [groupCode, memberId, triggerWakeup]);

  // Quay lại app / mở khóa màn hình / có mạng trở lại
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        return;
      }
      const hiddenFor = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : 0;
      hiddenAtRef.current = null;

      const socketOpen = wsRef.current?.readyState === WebSocket.OPEN;
      if (!socketOpen) {
        reconnectAttemptsRef.current = 0;
        connect(); // onopen sẽ tự đồng bộ bù
      } else if (hiddenFor >= WAKEUP_MIN_HIDDEN_MS) {
        // Trình duyệt mobile có thể đã treo socket khi ẩn -> đồng bộ lại 1 lần
        triggerWakeup();
      }
    };

    const handleOnline = () => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        reconnectAttemptsRef.current = 0;
        connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
    };
  }, [connect, triggerWakeup]);

  // Fallback polling chỉ khi mất WebSocket, app đang mở; 0 request khi WebSocket hoạt động
  useEffect(() => {
    if (!groupCode || isConnected) {
      if (fallbackPollRef.current) {
        clearInterval(fallbackPollRef.current);
        fallbackPollRef.current = null;
      }
      return;
    }

    fallbackPollRef.current = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) triggerWakeup();
    }, 30_000);

    return () => {
      if (fallbackPollRef.current) {
        clearInterval(fallbackPollRef.current);
        fallbackPollRef.current = null;
      }
    };
  }, [groupCode, isConnected, triggerWakeup]);

  useEffect(() => {
    connect();
    return () => {
      clearTimers();
      if (fallbackPollRef.current) clearInterval(fallbackPollRef.current);
      const ws = wsRef.current;
      if (ws) {
        ws.onclose = null;
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
      wsRef.current = null;
    };
  }, [connect]);

  return { isConnected, reconnect: connect };
}
