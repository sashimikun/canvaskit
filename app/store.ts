import { create } from "zustand";
import { nanoid } from "nanoid";
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { IndexeddbPersistence } from "y-indexeddb";
import {
  DesignNode,
  SceneNode,
  TextNode,
  ToolType,
  Camera,
  PageData,
  SmartGuide,
} from "./types";
import randomColor from "randomcolor";

function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneNodesMap(nodes: Map<string, DesignNode>): Map<string, DesignNode> {
  const clone = new Map<string, DesignNode>();
  nodes.forEach((node, id) => {
    clone.set(id, deepClone(node));
  });
  return clone;
}

function getWorldPosition(
  node: SceneNode,
  nodes: Map<string, DesignNode>
): { x: number; y: number } {
  let x = node.x;
  let y = node.y;
  let parentId = node.parentId;

  while (parentId) {
    const parent = nodes.get(parentId) as SceneNode | undefined;
    if (!parent) break;
    x += parent.x;
    y += parent.y;
    parentId = parent.parentId;
  }

  return { x, y };
}

function getParentWorldPosition(
  parentId: string | null,
  nodes: Map<string, DesignNode>
): { x: number; y: number } {
  if (!parentId) return { x: 0, y: 0 };
  const parent = nodes.get(parentId) as SceneNode | undefined;
  if (!parent) return { x: 0, y: 0 };
  return getWorldPosition(parent, nodes);
}

function createDefaultNode(
  type: DesignNode["type"],
  overrides: Partial<SceneNode> = {}
): SceneNode {
  return {
    id: nanoid(),
    type,
    name: type.charAt(0) + type.slice(1).toLowerCase(),
    visible: true,
    locked: false,
    parentId: null,
    children: [],
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    blendMode: "NORMAL",
    fills: [{ type: "SOLID", color: { r: 0.85, g: 0.85, b: 0.85, a: 1 }, opacity: 1 }],
    strokes: [],
    strokeWeight: 0,
    strokeAlign: "CENTER",
    cornerRadius: 0,
    effects: [],
    constraints: { horizontal: "MIN", vertical: "MIN" },
    clipContent: false,
    ...overrides,
  };
}

function createDefaultTextNode(overrides: Partial<TextNode> = {}): TextNode {
  return {
    ...createDefaultNode("TEXT"),
    type: "TEXT",
    characters: "Text",
    fontFamily: "Inter",
    fontWeight: 400,
    fontSize: 16,
    lineHeight: "AUTO" as const,
    letterSpacing: 0,
    textAlign: "LEFT" as const,
    textDecoration: "NONE" as const,
    textCase: "ORIGINAL" as const,
    fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 1 }],
    ...overrides,
  } as TextNode;
}

interface EditorState {
  // Yjs
  doc: Y.Doc | null;
  provider: WebrtcProvider | null;
  awareness: any | null;
  undoManager: Y.UndoManager | null;

  // Document
  nodes: Map<string, DesignNode>;
  pages: PageData[];
  currentPageId: string;
  documentName: string;

  // Selection
  selectedIds: Set<string>;
  hoveredId: string | null;

  // Tool
  activeTool: ToolType;

  // Camera
  camera: Camera;

  // UI
  showLeftPanel: boolean;
  showRightPanel: boolean;
  smartGuides: SmartGuide[];
  clipboard: DesignNode[];
  toasts: { id: string; message: string; timestamp: number }[];

  // Drawing state
  isDrawing: boolean;
  drawStart: { x: number; y: number } | null;

  // Actions
  initialize: (roomId: string) => void;
  addNode: (node: DesignNode, parentId?: string) => void;
  updateNode: (id: string, updates: Partial<DesignNode>) => void;
  deleteNodes: (ids: string[]) => void;
  setSelectedIds: (ids: Set<string>) => void;
  toggleSelection: (id: string) => void;
  setHoveredId: (id: string | null) => void;
  setActiveTool: (tool: ToolType) => void;
  setCamera: (camera: Partial<Camera>) => void;
  setShowLeftPanel: (show: boolean) => void;
  setShowRightPanel: (show: boolean) => void;
  setSmartGuides: (guides: SmartGuide[]) => void;
  setIsDrawing: (drawing: boolean) => void;
  setDrawStart: (point: { x: number; y: number } | null) => void;
  setDocumentName: (name: string) => void;

  // Complex actions
  createShape: (
    type: DesignNode["type"],
    x: number,
    y: number,
    width: number,
    height: number,
    overrides?: Partial<SceneNode>
  ) => string;
  createTextNode: (x: number, y: number, overrides?: Partial<TextNode>) => string;
  duplicateNodes: (ids: string[]) => void;
  groupNodes: (ids: string[]) => void;
  ungroupNodes: (ids: string[]) => void;
  moveNodes: (ids: string[], dx: number, dy: number) => void;
  reorderNode: (id: string, newIndex: number, newParentId?: string) => void;
  bringForward: (ids: string[]) => void;
  sendBackward: (ids: string[]) => void;
  bringToFront: (ids: string[]) => void;
  sendToBack: (ids: string[]) => void;

  // History
  pushHistory: (description: string) => void;
  undo: () => void;
  redo: () => void;

  // Clipboard
  copyNodes: () => void;
  pasteNodes: () => void;

  // Pages
  addPage: () => void;
  setCurrentPage: (pageId: string) => void;
  renamePage: (pageId: string, name: string) => void;
  deletePage: (pageId: string) => void;

  // Toast
  addToast: (message: string) => void;
  removeToast: (id: string) => void;

  // Persistence
  importDocument: (json: string) => void;
  exportDocument: () => string; // Keep export for manual file save

  // Get helpers
  getNode: (id: string) => DesignNode | undefined;
  getSelectedNodes: () => DesignNode[];
  getCurrentPageNodes: () => DesignNode[];
  getChildNodes: (parentId: string) => DesignNode[];
}

const defaultPageId = nanoid();

export const useEditorStore = create<EditorState>((set, get) => ({
  doc: null,
  provider: null,
  awareness: null,
  undoManager: null,

  nodes: new Map(),
  pages: [{ id: defaultPageId, name: "Page 1", children: [] }],
  currentPageId: defaultPageId,
  documentName: "Untitled",

  selectedIds: new Set(),
  hoveredId: null,

  activeTool: "SELECT",
  camera: { x: 0, y: 0, zoom: 1 },

  showLeftPanel: true,
  showRightPanel: true,
  smartGuides: [],
  clipboard: [],
  toasts: [],

  isDrawing: false,
  drawStart: null,

  initialize: (roomId: string) => {
    if (get().doc) return;

    const doc = new Y.Doc({ guid: roomId });
    const provider = new WebrtcProvider(roomId, doc, {
        signaling: ['wss://y-webrtc-signaling-eu.herokuapp.com', 'wss://signaling.yjs.dev']
    });
    const persistence = new IndexeddbPersistence(roomId, doc);

    const yNodes = doc.getMap<DesignNode>("nodes");
    const yPages = doc.getArray<PageData>("pages");
    const yMeta = doc.getMap<string>("meta");

    const undoManager = new Y.UndoManager([yNodes, yPages], {
        trackedOrigins: new Set([doc.clientID, null]), // Track local and non-tagged changes
    });

    persistence.on('synced', () => {
        if (yPages.length === 0) {
            doc.transact(() => {
                 const defaultId = nanoid();
                 yPages.push([{ id: defaultId, name: "Page 1", children: [] }]);
            });
        }
        // Restore document name if empty
        if (!yMeta.has("name")) {
            yMeta.set("name", "Untitled");
        }
    });

    const updateState = () => {
        const nodes = new Map<string, DesignNode>();
        yNodes.forEach((v, k) => nodes.set(k, v));

        const pages = yPages.toArray();
        const documentName = yMeta.get("name") || "Untitled";

        set((state) => {
            // Ensure currentPageId is valid
            let { currentPageId } = state;
            if (pages.length > 0 && !pages.find(p => p.id === currentPageId)) {
                currentPageId = pages[0].id;
            }
            return { nodes, pages, documentName, currentPageId };
        });
    };

    yNodes.observe(updateState);
    yPages.observe(updateState);
    yMeta.observe(updateState);

    updateState();

    set({ doc, provider, awareness: provider.awareness, undoManager });
  },

  addNode: (node, parentId) => {
    const { doc } = get();
    if (!doc) return;

    doc.transact(() => {
        const yNodes = doc.getMap<DesignNode>("nodes");
        const yPages = doc.getArray<PageData>("pages");

        const nextNode = {
            ...node,
            parentId: parentId ?? node.parentId ?? null,
        } as DesignNode;
        yNodes.set(nextNode.id, nextNode);

        if (parentId) {
            const parent = yNodes.get(parentId);
            if (parent) {
                yNodes.set(parentId, { ...parent, children: [...parent.children, nextNode.id] });
            }
        } else {
            const state = get();
            const pageIndex = yPages.toArray().findIndex(p => p.id === state.currentPageId);
            if (pageIndex >= 0) {
                const page = yPages.get(pageIndex);
                const newPage = { ...page, children: [...page.children, nextNode.id] };
                yPages.delete(pageIndex);
                yPages.insert(pageIndex, [newPage]);
            }
        }
    });
  },

  updateNode: (id, updates) => {
    const { doc } = get();
    if (!doc) return;
    doc.transact(() => {
        const yNodes = doc.getMap<DesignNode>("nodes");
        const node = yNodes.get(id);
        if (node) {
            yNodes.set(id, { ...node, ...updates } as DesignNode);
        }
    });
  },

  deleteNodes: (ids) => {
    const { doc } = get();
    if (!doc) return;

    doc.transact(() => {
        const yNodes = doc.getMap<DesignNode>("nodes");
        const yPages = doc.getArray<PageData>("pages");

        const deleteRecursive = (nodeId: string) => {
            const node = yNodes.get(nodeId);
            if (!node) return;
            for (const childId of node.children) {
                deleteRecursive(childId);
            }
            yNodes.delete(nodeId);

            // Remove from parent
            if (node.parentId) {
                const parent = yNodes.get(node.parentId);
                if (parent) {
                    yNodes.set(node.parentId, {
                        ...parent,
                        children: parent.children.filter(c => c !== nodeId)
                    });
                }
            } else {
                // Remove from pages
                // This is inefficient O(N*M) but pages are few
                for (let i = 0; i < yPages.length; i++) {
                    const page = yPages.get(i);
                    if (page.children.includes(nodeId)) {
                        const newPage = { ...page, children: page.children.filter(c => c !== nodeId) };
                        yPages.delete(i);
                        yPages.insert(i, [newPage]);
                    }
                }
            }
        };

        for (const id of ids) {
            deleteRecursive(id);
        }
    });
    set({ selectedIds: new Set() });
  },

  setSelectedIds: (ids) => set({ selectedIds: ids }),
  toggleSelection: (id) =>
    set((state) => {
      const newIds = new Set(state.selectedIds);
      if (newIds.has(id)) newIds.delete(id);
      else newIds.add(id);
      return { selectedIds: newIds };
    }),
  setHoveredId: (id) => set({ hoveredId: id }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setCamera: (camera) =>
    set((state) => ({ camera: { ...state.camera, ...camera } })),
  setShowLeftPanel: (show) => set({ showLeftPanel: show }),
  setShowRightPanel: (show) => set({ showRightPanel: show }),
  setSmartGuides: (guides) => set({ smartGuides: guides }),
  setIsDrawing: (drawing) => set({ isDrawing: drawing }),
  setDrawStart: (point) => set({ drawStart: point }),
  setDocumentName: (name) => {
      const { doc } = get();
      if (!doc) return;
      doc.transact(() => {
          doc.getMap<string>("meta").set("name", name);
      });
  },

  createShape: (type, x, y, width, height, overrides = {}) => {
    const fills: SceneNode["fills"] =
      type === "LINE"
        ? []
        : [
            {
              type: "SOLID",
              color: { r: 0.85, g: 0.85, b: 0.85, a: 1 },
              opacity: 1,
            },
          ];
    const strokes: SceneNode["strokes"] =
      type === "LINE"
        ? [
            {
              type: "SOLID",
              color: { r: 0, g: 0, b: 0, a: 1 },
              opacity: 1,
            },
          ]
        : [];
    const strokeWeight = type === "LINE" ? 2 : 0;

    const frameFills: SceneNode["fills"] =
      type === "FRAME"
        ? [
            {
              type: "SOLID",
              color: { r: 1, g: 1, b: 1, a: 1 },
              opacity: 1,
            },
          ]
        : fills;

    const node = createDefaultNode(type, {
      x,
      y,
      width,
      height,
      fills: type === "FRAME" ? frameFills : fills,
      strokes,
      strokeWeight,
      clipContent: type === "FRAME",
      ...overrides,
    });

    get().addNode(node);
    // pushHistory handled by UndoManager
    return node.id;
  },

  createTextNode: (x, y, overrides = {}) => {
    const node = createDefaultTextNode({
      x,
      y,
      width: 100,
      height: 24,
      ...overrides,
    });
    get().addNode(node);
    return node.id;
  },

  duplicateNodes: (ids) => {
    const state = get();
    const { doc } = state;
    if (!doc) return;

    doc.transact(() => {
        const yNodes = doc.getMap<DesignNode>("nodes");
        const yPages = doc.getArray<PageData>("pages");
        const newIds: string[] = [];

        for (const id of ids) {
            const node = yNodes.get(id);
            if (!node) continue;
            const newId = nanoid();
            const dup = { ...node, id: newId, x: (node as SceneNode).x + 20, y: (node as SceneNode).y + 20 } as DesignNode;
            yNodes.set(newId, dup);
            newIds.push(newId);

            if (node.parentId) {
                const parent = yNodes.get(node.parentId);
                if (parent) {
                    yNodes.set(node.parentId, { ...parent, children: [...parent.children, newId] });
                }
            } else {
                 const pageIdx = yPages.toArray().findIndex(p => p.id === state.currentPageId);
                 if (pageIdx >= 0) {
                     const page = yPages.get(pageIdx);
                     const newPage = { ...page, children: [...page.children, newId] };
                     yPages.delete(pageIdx);
                     yPages.insert(pageIdx, [newPage]);
                 }
            }
        }
        set({ selectedIds: new Set(newIds) });
    });
  },

  groupNodes: (ids) => {
    const state = get();
    const { doc } = state;
    if (!doc) return;
    if (ids.length < 2) return;

    doc.transact(() => {
        const yNodes = doc.getMap<DesignNode>("nodes");
        const yPages = doc.getArray<PageData>("pages");

        const validIds = ids.filter(id => yNodes.has(id));
        if (validIds.length < 2) return;

        const firstNode = yNodes.get(validIds[0]) as SceneNode | undefined;
        const parentId = firstNode?.parentId ?? null;

        // Helper access current nodes from Yjs
        const getNode = (id: string) => yNodes.get(id);
        const getNodesMap = () => {
             const m = new Map<string, DesignNode>();
             yNodes.forEach((v, k) => m.set(k, v));
             return m;
        };
        const currentNodesMap = getNodesMap(); // Snapshot for calculation

        const parentWorld = getParentWorldPosition(parentId, currentNodesMap);

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const worldPositions = new Map<string, { x: number; y: number }>();

        for (const id of validIds) {
            const n = currentNodesMap.get(id) as SceneNode;
            if (!n) continue;
            const worldPos = getWorldPosition(n, currentNodesMap);
            worldPositions.set(id, worldPos);
            minX = Math.min(minX, worldPos.x);
            minY = Math.min(minY, worldPos.y);
            maxX = Math.max(maxX, worldPos.x + n.width);
            maxY = Math.max(maxY, worldPos.y + n.height);
        }

        const group = createDefaultNode("GROUP", {
            x: minX - parentWorld.x,
            y: minY - parentWorld.y,
            width: maxX - minX,
            height: maxY - minY,
            fills: [],
            children: [...validIds],
            parentId,
        });

        // Remove from old parents
        for (const id of validIds) {
            const node = yNodes.get(id);
            if (!node) continue;
            if (node.parentId) {
                const parent = yNodes.get(node.parentId);
                if (parent) {
                    yNodes.set(node.parentId, { ...parent, children: parent.children.filter(c => c !== id) });
                }
            } else {
                 for (let i = 0; i < yPages.length; i++) {
                     const page = yPages.get(i);
                     if (page.children.includes(id)) {
                         const newPage = { ...page, children: page.children.filter(c => c !== id) };
                         yPages.delete(i);
                         yPages.insert(i, [newPage]);
                     }
                 }
            }
        }

        // Update nodes with new parent and positions
        for (const id of validIds) {
             const node = yNodes.get(id) as SceneNode | undefined;
             const worldPos = worldPositions.get(id);
             if (!node || !worldPos) continue;
             yNodes.set(id, {
                 ...node,
                 parentId: group.id,
                 x: worldPos.x - minX,
                 y: worldPos.y - minY
             } as DesignNode);
        }

        // Add group
        yNodes.set(group.id, group as DesignNode);

        // Add group to parent
        if (parentId) {
            const parent = yNodes.get(parentId);
            if (parent) {
                yNodes.set(parentId, { ...parent, children: [...parent.children, group.id] });
            }
        } else {
             const pageIdx = yPages.toArray().findIndex(p => p.id === state.currentPageId);
             if (pageIdx >= 0) {
                 const page = yPages.get(pageIdx);
                 const newPage = { ...page, children: [...page.children, group.id] };
                 yPages.delete(pageIdx);
                 yPages.insert(pageIdx, [newPage]);
             }
        }

        set({ selectedIds: new Set([group.id]) });
    });
  },

  ungroupNodes: (ids) => {
    const state = get();
    const { doc } = state;
    if (!doc) return;

    doc.transact(() => {
        const yNodes = doc.getMap<DesignNode>("nodes");
        const yPages = doc.getArray<PageData>("pages");

        // Snapshot
        const currentNodesMap = new Map<string, DesignNode>();
        yNodes.forEach((v, k) => currentNodesMap.set(k, v));

        const newSelectedIds: string[] = [];

        for (const id of ids) {
            const node = yNodes.get(id) as SceneNode | undefined;
            if (!node || node.type !== "GROUP") continue;

            const groupWorld = getWorldPosition(node, currentNodesMap);
            const parentWorld = getParentWorldPosition(node.parentId, currentNodesMap);

            // Remove group from parent
            if (node.parentId) {
                const parent = yNodes.get(node.parentId);
                if (parent) {
                    yNodes.set(node.parentId, { ...parent, children: parent.children.filter(c => c !== id) });
                }
            } else {
                 for (let i = 0; i < yPages.length; i++) {
                     const page = yPages.get(i);
                     if (page.children.includes(id)) {
                         const newPage = { ...page, children: page.children.filter(c => c !== id) };
                         yPages.delete(i);
                         yPages.insert(i, [newPage]);
                     }
                 }
            }

            // Move children out
            for (const childId of node.children) {
                const child = yNodes.get(childId) as SceneNode | undefined;
                if (!child) continue;
                const childWorld = {
                    x: groupWorld.x + child.x,
                    y: groupWorld.y + child.y
                };

                yNodes.set(childId, {
                    ...child,
                    parentId: node.parentId,
                    x: childWorld.x - parentWorld.x,
                    y: childWorld.y - parentWorld.y
                } as DesignNode);
                newSelectedIds.push(childId);
            }

            // Add children to parent
            if (node.parentId) {
                const parent = yNodes.get(node.parentId);
                if (parent) {
                    yNodes.set(node.parentId, { ...parent, children: [...parent.children, ...node.children] });
                }
            } else {
                 const pageIdx = yPages.toArray().findIndex(p => p.id === state.currentPageId);
                 if (pageIdx >= 0) {
                     const page = yPages.get(pageIdx);
                     const newPage = { ...page, children: [...page.children, ...node.children] };
                     yPages.delete(pageIdx);
                     yPages.insert(pageIdx, [newPage]);
                 }
            }

            yNodes.delete(id);
        }
        set({ selectedIds: new Set(newSelectedIds) });
    });
  },

  moveNodes: (ids, dx, dy) => {
      const { doc } = get();
      if (!doc) return;
      doc.transact(() => {
          const yNodes = doc.getMap<DesignNode>("nodes");
          for (const id of ids) {
              const node = yNodes.get(id) as SceneNode;
              if (node && !node.locked) {
                  yNodes.set(id, { ...node, x: node.x + dx, y: node.y + dy } as DesignNode);
              }
          }
      });
  },

  reorderNode: (id, newIndex, newParentId) => {
      const { doc, currentPageId } = get();
      if (!doc) return;
      doc.transact(() => {
          const yNodes = doc.getMap<DesignNode>("nodes");
          const yPages = doc.getArray<PageData>("pages");

          const node = yNodes.get(id);
          if (!node) return;

          // Remove from old parent
          if (node.parentId) {
              const parent = yNodes.get(node.parentId);
              if (parent) {
                  yNodes.set(node.parentId, { ...parent, children: parent.children.filter(c => c !== id) });
              }
          } else {
               for (let i = 0; i < yPages.length; i++) {
                   const page = yPages.get(i);
                   if (page.children.includes(id)) {
                       const newPage = { ...page, children: page.children.filter(c => c !== id) };
                       yPages.delete(i);
                       yPages.insert(i, [newPage]);
                   }
               }
          }

          // Add to new parent
          const targetParentId = newParentId ?? node.parentId;
          if (targetParentId) {
              const parent = yNodes.get(targetParentId);
              if (parent) {
                  const children = [...parent.children];
                  children.splice(newIndex, 0, id);
                  yNodes.set(targetParentId, { ...parent, children });
              }
          } else {
               const pageIdx = yPages.toArray().findIndex(p => p.id === currentPageId);
               if (pageIdx >= 0) {
                   const page = yPages.get(pageIdx);
                   const children = [...page.children];
                   children.splice(newIndex, 0, id);
                   const newPage = { ...page, children };
                   yPages.delete(pageIdx);
                   yPages.insert(pageIdx, [newPage]);
               }
          }

          yNodes.set(id, { ...node, parentId: targetParentId ?? null } as DesignNode);
      });
  },

  bringForward: (ids) => {
    const { doc, currentPageId } = get();
    if (!doc) return;
    const yNodes = doc.getMap<DesignNode>("nodes");
    const yPages = doc.getArray<PageData>("pages");

    for (const id of ids) {
        const node = yNodes.get(id);
        if (!node) continue;
        const siblings = node.parentId
            ? yNodes.get(node.parentId)?.children || []
            : yPages.toArray().find(p => p.id === currentPageId)?.children || [];
        const idx = siblings.indexOf(id);
        if (idx < siblings.length - 1) {
            get().reorderNode(id, idx + 1);
        }
    }
  },

  sendBackward: (ids) => {
    const { doc, currentPageId } = get();
    if (!doc) return;
    const yNodes = doc.getMap<DesignNode>("nodes");
    const yPages = doc.getArray<PageData>("pages");

    for (const id of ids) {
        const node = yNodes.get(id);
        if (!node) continue;
        const siblings = node.parentId
            ? yNodes.get(node.parentId)?.children || []
            : yPages.toArray().find(p => p.id === currentPageId)?.children || [];
        const idx = siblings.indexOf(id);
        if (idx > 0) {
            get().reorderNode(id, idx - 1);
        }
    }
  },

  bringToFront: (ids) => {
    const { doc, currentPageId } = get();
    if (!doc) return;
    const yNodes = doc.getMap<DesignNode>("nodes");
    const yPages = doc.getArray<PageData>("pages");

    for (const id of ids) {
        const node = yNodes.get(id);
        if (!node) continue;
        const siblings = node.parentId
            ? yNodes.get(node.parentId)?.children || []
            : yPages.toArray().find(p => p.id === currentPageId)?.children || [];
        get().reorderNode(id, siblings.length - 1);
    }
  },

  sendToBack: (ids) => {
    for (const id of ids) {
        get().reorderNode(id, 0);
    }
  },

  pushHistory: (description) => {
      // Handled by Y.UndoManager automatically
      // We might want to add a description to the transaction origin if needed,
      // but standard undo/redo is sufficient for now.
  },

  undo: () => get().undoManager?.undo(),
  redo: () => get().undoManager?.redo(),

  copyNodes: () => {
    const state = get();
    const copied: DesignNode[] = [];
    for (const id of state.selectedIds) {
      const node = state.nodes.get(id);
      if (node) copied.push(deepClone(node));
    }
    set({ clipboard: copied });
  },

  pasteNodes: () => {
      const state = get();
      if (state.clipboard.length === 0) return;
      const { doc } = state;
      if (!doc) return;

      doc.transact(() => {
          const yNodes = doc.getMap<DesignNode>("nodes");
          const yPages = doc.getArray<PageData>("pages");
          const newIds: string[] = [];

          for (const node of state.clipboard) {
              const newId = nanoid();
              const dup = {
                  ...deepClone(node),
                  id: newId,
                  parentId: null,
                  x: (node as SceneNode).x + 20,
                  y: (node as SceneNode).y + 20
              } as DesignNode;
              yNodes.set(newId, dup);
              newIds.push(newId);

              const pageIdx = yPages.toArray().findIndex(p => p.id === state.currentPageId);
              if (pageIdx >= 0) {
                   const page = yPages.get(pageIdx);
                   const newPage = { ...page, children: [...page.children, newId] };
                   yPages.delete(pageIdx);
                   yPages.insert(pageIdx, [newPage]);
              }
          }
          set({ selectedIds: new Set(newIds) });
      });
  },

  addPage: () => {
      const { doc } = get();
      if (!doc) return;
      doc.transact(() => {
          const yPages = doc.getArray<PageData>("pages");
          const newPage: PageData = {
              id: nanoid(),
              name: `Page ${yPages.length + 1}`,
              children: []
          };
          yPages.push([newPage]);
          set({ currentPageId: newPage.id, selectedIds: new Set() });
      });
  },

  setCurrentPage: (pageId) =>
    set({ currentPageId: pageId, selectedIds: new Set() }),

  renamePage: (pageId, name) => {
      const { doc } = get();
      if (!doc) return;
      doc.transact(() => {
          const yPages = doc.getArray<PageData>("pages");
          const idx = yPages.toArray().findIndex(p => p.id === pageId);
          if (idx >= 0) {
              const page = yPages.get(idx);
              const newPage = { ...page, name };
              yPages.delete(idx);
              yPages.insert(idx, [newPage]);
          }
      });
  },

  deletePage: (pageId) => {
      const { doc } = get();
      if (!doc) return;
      doc.transact(() => {
          const yPages = doc.getArray<PageData>("pages");
          const yNodes = doc.getMap<DesignNode>("nodes");

          if (yPages.length <= 1) return;
          const idx = yPages.toArray().findIndex(p => p.id === pageId);
          if (idx < 0) return;

          const page = yPages.get(idx);

          // Delete children
          const deleteRecursive = (nodeId: string) => {
              const node = yNodes.get(nodeId);
              if (!node) return;
              for (const childId of node.children) {
                  deleteRecursive(childId);
              }
              yNodes.delete(nodeId);
          };
          for (const childId of page.children) {
              deleteRecursive(childId);
          }

          yPages.delete(idx);

          const state = get();
          if (state.currentPageId === pageId) {
               const newPage = yPages.get(0);
               set({ currentPageId: newPage.id, selectedIds: new Set() });
          }
      });
  },

  addToast: (message) =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        { id: nanoid(), message, timestamp: Date.now() },
      ],
    })),

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  importDocument: (json) => {
      const { doc } = get();
      if (!doc) return;

      try {
          const imported = JSON.parse(json);
          doc.transact(() => {
               const yNodes = doc.getMap<DesignNode>("nodes");
               const yPages = doc.getArray<PageData>("pages");
               const yMeta = doc.getMap<string>("meta");

               // Clear existing
               // yNodes.clear(); // Yjs doesn't have clear on Map? It does in newer versions or use keys
               Array.from(yNodes.keys()).forEach(k => yNodes.delete(k));
               yPages.delete(0, yPages.length);

               if (imported.nodes) {
                   for (const [k, v] of Object.entries(imported.nodes)) {
                       yNodes.set(k, deepClone(v as DesignNode));
                   }
               }

               if (Array.isArray(imported.pages) && imported.pages.length > 0) {
                   yPages.push(deepClone(imported.pages));
               } else {
                   yPages.push([{ id: nanoid(), name: "Page 1", children: [] }]);
               }

               yMeta.set("name", imported.name || "Imported");
          });

          get().addToast("Document imported");
      } catch (e) {
          get().addToast("Failed to import document");
      }
  },

  exportDocument: () => {
    const state = get();
    const nodesObj: Record<string, DesignNode> = {};
    state.nodes.forEach((v, k) => {
      nodesObj[k] = v;
    });
    return JSON.stringify(
      {
        formatVersion: "1.0",
        name: state.documentName,
        lastModified: new Date().toISOString(),
        pages: state.pages,
        nodes: nodesObj,
        components: {},
        styles: { colors: {}, text: {}, effects: {} },
        assets: { images: {} },
      },
      null,
      2
    );
  },

  // Helpers
  getNode: (id) => get().nodes.get(id),
  getSelectedNodes: () => {
    const state = get();
    return Array.from(state.selectedIds)
      .map((id) => state.nodes.get(id))
      .filter(Boolean) as DesignNode[];
  },
  getCurrentPageNodes: () => {
    const state = get();
    const page = state.pages.find((p) => p.id === state.currentPageId);
    if (!page) return [];
    const result: DesignNode[] = [];
    const collectNodes = (childIds: string[]) => {
      for (const id of childIds) {
        const node = state.nodes.get(id);
        if (node) {
          result.push(node);
          if (node.children.length > 0) {
            collectNodes(node.children);
          }
        }
      }
    };
    collectNodes(page.children);
    return result;
  },
  getChildNodes: (parentId) => {
    const state = get();
    const parent = state.nodes.get(parentId);
    if (!parent) return [];
    return parent.children
      .map((id) => state.nodes.get(id))
      .filter(Boolean) as DesignNode[];
  },
})
);
