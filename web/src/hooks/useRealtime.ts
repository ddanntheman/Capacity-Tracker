import { useEffect, useRef } from "react";
import * as signalR from "@microsoft/signalr";
import { Realtime } from "@/lib/realtime";

export interface AllocationChange {
  action: "created" | "updated" | "removed";
  allocationId: string;
  personId: string;
  projectId: string;
  weekStart: string;
  percentAllocated: number;
}

/**
 * Subscribes to allocation changes for the given weeks via the serverless
 * SignalR hub. Re-joins groups whenever the visible week window changes.
 */
export function useAllocationRealtime(weekStarts: string[], onChange: (change: AllocationChange) => void) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const key = weekStarts.join(",");

  useEffect(() => {
    let connection: signalR.HubConnection | null = null;
    let cancelled = false;
    const weeks = key ? key.split(",") : [];

    // Join the week-scoped groups for a given connection id. Called on initial
    // connect and again after every automatic reconnect (the reconnect assigns
    // a new connection id, so prior group memberships are lost server-side).
    async function joinGroups(connectionId: string | null) {
      if (!connectionId || weeks.length === 0) return;
      await fetch("/api/groups/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, weekStarts: weeks }),
      });
    }

    async function connect() {
      try {
        connection = new signalR.HubConnectionBuilder()
          // The client library appends "/negotiate" to this hub URL, so SWA
          // routes the handshake to the Functions negotiate trigger at /api/negotiate.
          .withUrl("/api")
          .withAutomaticReconnect()
          .build();

        connection.on(Realtime.AllocationChangedEvent, (change: AllocationChange) => {
          onChangeRef.current(change);
        });

        connection.onreconnected((connectionId) => {
          void joinGroups(connectionId ?? null);
        });

        await connection.start();
        if (cancelled) return;

        await joinGroups(connection.connectionId);
      } catch (err) {
        // Real-time is best-effort; the UI still works via polling/refetch.
        console.warn("SignalR connection failed", err);
      }
    }

    void connect();

    return () => {
      cancelled = true;
      void connection?.stop();
    };
  }, [key]);
}
