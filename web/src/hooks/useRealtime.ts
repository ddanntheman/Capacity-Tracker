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
  onChangeRef.current = onChange;

  const key = weekStarts.join(",");

  useEffect(() => {
    let connection: signalR.HubConnection | null = null;
    let cancelled = false;
    const weeks = key ? key.split(",") : [];

    async function connect() {
      try {
        connection = new signalR.HubConnectionBuilder()
          .withUrl("/api/negotiate", {
            httpClient: undefined,
            // Static Web Apps routes /api/negotiate to the Functions negotiate trigger.
          })
          .withAutomaticReconnect()
          .build();

        connection.on(Realtime.AllocationChangedEvent, (change: AllocationChange) => {
          onChangeRef.current(change);
        });

        await connection.start();
        if (cancelled) return;

        const connectionId = connection.connectionId;
        if (connectionId && weeks.length > 0) {
          await fetch("/api/groups/join", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ connectionId, weekStarts: weeks }),
          });
        }
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
