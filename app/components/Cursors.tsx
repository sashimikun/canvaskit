"use client";

import React, { useEffect, useState } from "react";
import { useEditorStore } from "../store";
import randomColor from "randomcolor";

interface CursorData {
  x: number;
  y: number;
  color: string;
  name: string;
}

export default function Cursors() {
  const awareness = useEditorStore((s) => s.awareness);
  const camera = useEditorStore((s) => s.camera);
  const [cursors, setCursors] = useState<Map<number, CursorData>>(new Map());

  useEffect(() => {
    if (!awareness) return;

    // Set local user info
    const color = randomColor({ luminosity: "dark" });
    const name = "User " + Math.floor(Math.random() * 1000);

    // Only set if not already set?
    if (!awareness.getLocalState()) {
         awareness.setLocalStateField("user", {
            name,
            color,
        });
    } else {
        // Ensure color/name exists
        const state = awareness.getLocalState();
        if (!state?.user) {
             awareness.setLocalStateField("user", {
                name,
                color,
            });
        }
    }

    const handleChange = () => {
        const states = awareness.getStates();
        const newCursors = new Map<number, CursorData>();
        states.forEach((state: any, clientId: number) => {
            if (clientId !== awareness.clientID && state.cursor && state.user) {
                newCursors.set(clientId, {
                    x: state.cursor.x,
                    y: state.cursor.y,
                    color: state.user.color,
                    name: state.user.name,
                });
            }
        });
        setCursors(newCursors);
    };

    awareness.on("change", handleChange);

    // Initial sync
    handleChange();

    return () => awareness.off("change", handleChange);
  }, [awareness]);

  return (
    <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
      {Array.from(cursors.entries()).map(([clientId, cursor]) => {
        const screenX = cursor.x * camera.zoom + camera.x;
        const screenY = cursor.y * camera.zoom + camera.y;

        return (
          <div
            key={clientId}
            className="absolute flex flex-col"
            style={{
                transform: `translate(${screenX}px, ${screenY}px)`,
                transition: "transform 0.1s linear",
            }}
          >
            <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                style={{ color: cursor.color }}
                className="drop-shadow-sm"
            >
                <path d="M1 1l6 14 3-6 5-2L1 1z" fill="currentColor" stroke="white" strokeWidth="1" />
            </svg>
            <div
                className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white whitespace-nowrap mt-1 self-start shadow-sm"
                style={{ backgroundColor: cursor.color }}
            >
                {cursor.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}
