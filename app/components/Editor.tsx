"use client";

import React, { useEffect, useState } from "react";
import { useEditorStore } from "../store";
import { SceneNode } from "../types";
import Toolbar from "./Toolbar";
import Canvas from "./Canvas";
import LayersPanel from "./LayersPanel";
import PropertiesPanel from "./PropertiesPanel";
import Toasts from "./Toasts";
import ShortcutHelp from "./ShortcutHelp";
import Cursors from "./Cursors";
import { fitImageToMaxWidth } from "../utils/imageSizing";
import { nanoid } from "nanoid";

export default function Editor() {
  const showLeftPanel = useEditorStore((s) => s.showLeftPanel);
  const showRightPanel = useEditorStore((s) => s.showRightPanel);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const camera = useEditorStore((s) => s.camera);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const nodes = useEditorStore((s) => s.nodes);
  const initialize = useEditorStore((s) => s.initialize);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let roomId = params.get("room");
    if (!roomId) {
      roomId = nanoid(10);
      const url = new URL(window.location.href);
      url.searchParams.set("room", roomId);
      window.history.replaceState({}, "", url.toString());
    }
    initialize(roomId);
  }, [initialize]);

  // ? key to toggle shortcut help
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
      }
      if (e.key === "Escape" && showShortcuts) {
        setShowShortcuts(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showShortcuts]);

  // Image drag-and-drop
  useEffect(() => {
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (!files) return;

      for (const file of Array.from(files)) {
        if (file.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = () => {
            const img = new Image();
            img.onload = () => {
              const state = useEditorStore.getState();
              const { camera } = state;
              const canvas = document.querySelector("canvas");
              if (!canvas) return;
              const rect = canvas.getBoundingClientRect();
              const worldX = ((e.clientX - rect.left) - camera.x) / camera.zoom;
              const worldY = ((e.clientY - rect.top) - camera.y) / camera.zoom;
              const maxImportWidth = rect.width / camera.zoom;
              const { width, height } = fitImageToMaxWidth(img.width, img.height, maxImportWidth);

              state.createShape("RECTANGLE", worldX, worldY, width, height, {
                name: file.name,
                fills: [{
                  type: "IMAGE" as const,
                  imageRef: reader.result as string,
                  scaleMode: "FILL" as const,
                }],
              });
            };
            img.src = reader.result as string;
          };
          reader.readAsDataURL(file);
        } else if (file.name.endsWith(".canvas.json") || file.name.endsWith(".json")) {
          const reader = new FileReader();
          reader.onload = () => {
            useEditorStore.getState().importDocument(reader.result as string);
          };
          reader.readAsText(file);
        }
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    window.addEventListener("drop", handleDrop);
    window.addEventListener("dragover", handleDragOver);
    return () => {
      window.removeEventListener("drop", handleDrop);
      window.removeEventListener("dragover", handleDragOver);
    };
  }, []);

  // Status bar info
  const selectedNodes = Array.from(selectedIds)
    .map((id) => nodes.get(id))
    .filter(Boolean) as SceneNode[];
  const firstNode = selectedNodes[0];

  return (
    <div className="h-screen w-screen flex flex-col bg-[#1a1a1a] overflow-hidden">
      <Toolbar />

      <div className="flex-1 flex overflow-hidden">
        {showLeftPanel && (
          <div className="w-60 bg-[#252525] border-r border-white/[0.06] flex flex-col overflow-hidden z-20">
            <LayersPanel />
          </div>
        )}

        <div className="flex-1 relative overflow-hidden bg-[#e5e5e5]">
            <Canvas />
            <Cursors />
        </div>

        {showRightPanel && (
          <div className="w-64 bg-[#252525] border-l border-white/[0.06] flex flex-col overflow-hidden z-20">
            <PropertiesPanel />
          </div>
        )}
      </div>

      <div className="h-7 bg-[#252525] border-t border-white/[0.06] flex items-center px-4 text-[10px] text-white/35 gap-4 z-30">
        <span>
          {selectedIds.size > 0
            ? `${selectedIds.size} selected`
            : "No selection"}
        </span>
        {firstNode && (
          <>
            <span className="text-white/25">|</span>
            <span>
              X: {Math.round(firstNode.x)}  Y: {Math.round(firstNode.y)}
            </span>
            <span>
              W: {Math.round(firstNode.width)}  H: {Math.round(firstNode.height)}
            </span>
            {firstNode.rotation !== 0 && (
              <span>R: {Math.round(firstNode.rotation)}°</span>
            )}
          </>
        )}
        <div className="flex-1" />
        <button
          className="text-white/25 hover:text-white/50 transition-colors cursor-pointer"
          onClick={() => setShowShortcuts(true)}
          title="Keyboard shortcuts"
        >
          ? Shortcuts
        </button>
        <span className="text-white/25">|</span>
        <span>Zoom: {Math.round(camera.zoom * 100)}%</span>
      </div>

      <Toasts />

      {showShortcuts && <ShortcutHelp onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}
