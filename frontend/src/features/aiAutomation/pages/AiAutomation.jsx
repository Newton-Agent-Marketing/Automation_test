import React, { useEffect, useState, useCallback, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Workflow,
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Zap,
  Calendar,
  Clock,
  Play,
  Pause,
  RotateCw,
  Terminal,
  History,
  Power,
  ChevronDown,
  Save,
  Check,
  AlertTriangle,
  X,
} from "lucide-react";
import {
  fetchAutomation,
  createNode,
  updateNodePosition,
  deleteNode,
  addEdge,
  removeEdge,
  moveNodeLocal,
  setSelectedNode,
  openDetailsDrawer,
  closeDetailsDrawer,
  openEditModal,
  closeEditModal,
  updateNodeText,
  updateNodeConfig,
  saveAutomation,
  validateAutomation,
  toggleActiveAutomation,
  runNowAutomation,
  fetchExecutionHistory,
  setConnectionAlert,
  clearConnectionAlert,
  clearError,
  clearSuccess,
} from "../aiAutomation.slice";
import { AiAutomationCanvas } from "../components/AiAutomationCanvas";
import { ExecutionResultsPanel } from "../components/ExecutionResultsPanel";
import { ExecutionHistoryModal } from "../components/ExecutionHistoryModal";
import { NodeTextEditorModal } from "../components/NodeTextEditorModal";
import { TriggerNodeConfigModal } from "../components/TriggerNodeConfigModal";
import { aiAutomationApi } from "../service/aiAutomation.api";
import { getSocket } from "../../chat/service/chat.socket";

/**
 * Extract connected workflow component (subgraph) containing startNodeId.
 * On a canvas with multiple workflows, this isolates ONLY the nodes and edges
 * belonging to the targeted workflow.
 */
export const getWorkflowSubgraph = (nodes = [], edges = [], startNodeId = null) => {
  if (!nodes || !nodes.length) {
    return { nodes: [], edges: [], rootNode: null, actionNode: null, triggerNode: null };
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const undirectedAdj = new Map();
  nodes.forEach((n) => undirectedAdj.set(n.id, []));
  edges.forEach((e) => {
    if (undirectedAdj.has(e.source) && undirectedAdj.has(e.target)) {
      undirectedAdj.get(e.source).push(e.target);
      undirectedAdj.get(e.target).push(e.source);
    }
  });

  let seedNodeId = startNodeId;
  if (!seedNodeId || !nodeMap.has(seedNodeId)) {
    const trigger = nodes.find((n) => n.type === "trigger");
    const action = nodes.find((n) => n.type === "action");
    seedNodeId = trigger?.id || action?.id || nodes[0]?.id;
  }

  const connectedIds = new Set();
  const queue = [seedNodeId];
  while (queue.length > 0) {
    const curr = queue.shift();
    if (connectedIds.has(curr)) continue;
    connectedIds.add(curr);

    for (const neighbor of undirectedAdj.get(curr) || []) {
      if (!connectedIds.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  const workflowNodes = nodes.filter((n) => connectedIds.has(n.id));
  const workflowEdges = edges.filter(
    (e) => connectedIds.has(e.source) && connectedIds.has(e.target)
  );

  const circularIds = new Set(
    workflowNodes
      .filter((n) => n.type === "action" || n.type === "date" || n.type === "time")
      .map((n) => n.id)
  );

  const actionNode =
    workflowNodes.find((n) => n.id === startNodeId && n.type === "action") ||
    workflowNodes.find((n) => n.type === "action") ||
    workflowNodes.find((n) => n.id === startNodeId) ||
    workflowNodes[0];

  const triggerNode = workflowNodes.find((n) => n.type === "trigger");

  // Determine the primary task node directly connected to actionNode, triggerNode, dateNode, or timeNode
  let directTaskNode = null;
  const preludeSeedIds = [actionNode?.id, triggerNode?.id].filter(Boolean);

  for (const edge of workflowEdges) {
    if (preludeSeedIds.includes(edge.source) && !circularIds.has(edge.target)) {
      directTaskNode = workflowNodes.find((n) => n.id === edge.target);
      if (directTaskNode) break;
    }
    if (preludeSeedIds.includes(edge.target) && !circularIds.has(edge.source)) {
      directTaskNode = workflowNodes.find((n) => n.id === edge.source);
      if (directTaskNode) break;
    }
  }

  // If not found from action/trigger, check date or time nodes
  if (!directTaskNode) {
    for (const edge of workflowEdges) {
      if (circularIds.has(edge.source) && !circularIds.has(edge.target)) {
        directTaskNode = workflowNodes.find((n) => n.id === edge.target);
        if (directTaskNode) break;
      }
      if (circularIds.has(edge.target) && !circularIds.has(edge.source)) {
        directTaskNode = workflowNodes.find((n) => n.id === edge.source);
        if (directTaskNode) break;
      }
    }
  }

  const taskCandidates = workflowNodes.filter((n) => !circularIds.has(n.id));
  taskCandidates.sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0));

  const rootTaskNode = directTaskNode || triggerNode || taskCandidates[0] || workflowNodes[0];
  const rootNode = directTaskNode || triggerNode || actionNode || taskCandidates[0] || workflowNodes[0];

  return {
    nodes: workflowNodes,
    edges: workflowEdges,
    rootNode,
    rootTaskNode,
    directTaskNode,
    actionNode,
    triggerNode,
  };
};

/**
 * Find all independent workflow subgraphs on the canvas.
 */
export const getAllWorkflowSubgraphs = (nodes = [], edges = []) => {
  if (!nodes || !nodes.length) return [];
  const visited = new Set();
  const workflows = [];

  const seeds = nodes.filter((n) => n.type === "trigger" || n.type === "action");
  for (const s of seeds) {
    if (visited.has(s.id)) continue;
    const sub = getWorkflowSubgraph(nodes, edges, s.id);
    sub.nodes.forEach((n) => visited.add(n.id));
    if (sub.nodes.length > 0) workflows.push(sub);
  }

  for (const n of nodes) {
    if (!visited.has(n.id)) {
      const sub = getWorkflowSubgraph(nodes, edges, n.id);
      sub.nodes.forEach((node) => visited.add(node.id));
      if (sub.nodes.length > 0) workflows.push(sub);
    }
  }

  return workflows;
};

export const AiAutomation = () => {
  const dispatch = useDispatch();
  const {
    nodes,
    edges,
    loading,
    saving,
    isRunning,
    isActive,
    lastRunAt,
    nextRunAt,
    error,
    successMessage,
    connectionAlert,
    selectedNodeId,
    isDetailsDrawerOpen,
    isEditingModalOpen,
    isEditModalOpen,
    editingNodeId,
    activeEditingNodeId,
  } = useSelector((state) => state.aiAutomation);

  const modalOpen = Boolean(isEditingModalOpen || isEditModalOpen);
  const currentEditId = editingNodeId || activeEditingNodeId;
  const activeEditingNode = nodes.find((n) => n.id === currentEditId);

  // Local state for UI menus and modals
  const [isTriggerMenuOpen, setIsTriggerMenuOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [validationBanner, setValidationBanner] = useState(null);
  const menuRef = useRef(null);

  // Workflow sequential execution animation state
  const [isExecutingWorkflow, setIsExecutingWorkflow] = useState(false);
  const [executingNodeId, setExecutingNodeId] = useState(null);
  const [executingEdgeIds, setExecutingEdgeIds] = useState([]);
  const [completedNodeIds, setCompletedNodeIds] = useState([]);
  const [completedEdgeIds, setCompletedEdgeIds] = useState([]);
  const [nodeStatusMap, setNodeStatusMap] = useState({});
  const [isWorkflowPaused, setIsWorkflowPaused] = useState(false);
  const [isResultsPanelOpen, setIsResultsPanelOpen] = useState(false);
  const [currentExecution, setCurrentExecution] = useState(null);
  const [allNodesBlue, setAllNodesBlue] = useState(false);
  const [activeWorkflowNodeIds, setActiveWorkflowNodeIds] = useState([]);
  const isExecutingWorkflowRef = useRef(false);
  const activeWorkflowRef = useRef(null);
  const lastScheduledRunKeyRef = useRef("");

  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const completedNodeIdsRef = useRef(completedNodeIds);
  completedNodeIdsRef.current = completedNodeIds;
  const completedEdgeIdsRef = useRef(completedEdgeIds);
  completedEdgeIdsRef.current = completedEdgeIds;

  // Track user's live cursor position inside canvas coordinates
  const lastCursorPosRef = useRef(null);
  const lastCanvasClickRef = useRef(null);
  const viewportCenterRef = useRef({ x: 300, y: 300 });

  const handleCursorMove = useCallback((pos) => {
    if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
      lastCursorPosRef.current = pos;
    }
  }, []);

  const handleCanvasClick = useCallback((pos) => {
    if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
      lastCanvasClickRef.current = pos;
      lastCursorPosRef.current = pos;
    }
  }, []);

  const handleViewportChange = useCallback((vp) => {
    if (vp?.center && typeof vp.center.x === "number" && typeof vp.center.y === "number") {
      viewportCenterRef.current = vp.center;
    }
  }, []);

  // Close dropdown menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsTriggerMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch automation canvas data on mount
  useEffect(() => {
    dispatch(fetchAutomation());
  }, [dispatch]);

  // Hydrate latest execution state on mount to preserve results on page refresh
  useEffect(() => {
    let isMounted = true;
    const hydrateLatestExecution = async () => {
      try {
        const res = await aiAutomationApi.getExecutions({ limit: 1 });
        const latest = res.data?.data?.[0];
        if (latest && isMounted) {
          setCurrentExecution(latest);
          const statusMap = {};
          const completedIds = [];
          const completedEdges = [];

          (latest.nodes || []).forEach((n) => {
            statusMap[n.nodeId] = {
              status: n.status,
              input: n.input,
              output: n.output,
              error: n.error,
              startedAt: n.startedAt,
              completedAt: n.completedAt,
              durationMs: n.durationMs,
            };
            if (n.status === "completed") {
              completedIds.push(n.nodeId);
              const edge = edges.find((e) => e.target === n.nodeId || e.source === n.nodeId);
              if (edge) completedEdges.push(edge.id);
            }
          });

          setNodeStatusMap(statusMap);
          setCompletedNodeIds(completedIds);

          if (latest.status === "completed") {
            setCompletedEdgeIds(edges.map((e) => e.id));
          } else {
            setCompletedEdgeIds(completedEdges);
          }

          if (latest.status === "running") {
            setIsExecutingWorkflow(true);
            isExecutingWorkflowRef.current = true;
          } else if (latest.status === "paused") {
            setIsWorkflowPaused(true);
          }
        }
      } catch (err) {
        console.warn("[AiAutomation] Failed to hydrate latest execution:", err);
      }
    };

    if (nodes.length > 0) {
      hydrateLatestExecution();
    }

    return () => {
      isMounted = false;
    };
  }, [nodes.length, edges]);

  // Check if a trigger node already exists
  const existingTriggerNode = nodes.find((n) => n.type === "trigger");

  // Handler for creating specific node types
  const handleCreateTypedNode = (type, customPos = null) => {
    setIsTriggerMenuOpen(false);

    // Rule: Exactly one Trigger node allowed
    if (type === "trigger" && existingTriggerNode) {
      dispatch(
        setConnectionAlert(
          "A Trigger node already exists on this canvas. Only one Trigger node is permitted per automation."
        )
      );
      return;
    }

    // Determine smart positioning:
    // 1. If customPos is explicitly provided (e.g. from right-click context menu), use it!
    // 2. Else if user explicitly clicked on the canvas (lastCanvasClickRef), use that!
    // 3. Else, use the current visible viewport center (viewportCenterRef) so it ALWAYS
    //    spawns right in the visible center of what the user is currently viewing on the screen!
    const targetBase =
      customPos ||
      lastCanvasClickRef.current ||
      viewportCenterRef.current || { x: 300, y: 300 };

    let posX = Math.round(targetBase.x);
    let posY = Math.round(targetBase.y);

    const isFromMenu = !customPos && !lastCanvasClickRef.current;
    if (isFromMenu) {
      // Natural viewport placement for prelude nodes
      if (type === "date") posY -= 85;
      else if (type === "time") posY += 85;
      else if (type === "generic") posX += 160;
    } else {
      // Natural spacing if near other nodes
      const nearbyNodes = nodes.filter(
        (n) => Math.hypot((n.position?.x ?? 0) - posX, (n.position?.y ?? 0) - posY) < 85
      );
      if (type === "date" && nearbyNodes.some((n) => n.type === "action")) {
        posY -= 85;
      } else if (type === "time" && nearbyNodes.some((n) => n.type === "action" || n.type === "date")) {
        posY += 85;
      } else if (nearbyNodes.length > 0) {
        posY += 75;
      }
    }

    lastCanvasClickRef.current = null;
    lastCursorPosRef.current = { x: posX, y: posY + 75 };

    // Default configuration objects
    let defaultLabel = type === "trigger" ? "Start Node" : "Normal Node";
    let defaultConfig = { mode: "schedule" };

    if (type === "date") {
      defaultLabel = "Date Schedule";
      defaultConfig = {
        dateType: "specific",
        specificDate: new Date().toISOString().split("T")[0],
        timezone: "Asia/Kolkata",
      };
    } else if (type === "action") {
      defaultLabel = "Action";
      defaultConfig = {
        actionType: "send_notification",
        message: "Generate my daily Meta Ads performance summary",
        priority: "medium",
      };
    } else if (type === "time") {
      defaultLabel = "Time Schedule";
      defaultConfig = {
        time: "09:00",
        timezone: "Asia/Kolkata",
        recurrence: "daily",
      };
    } else if (type === "generic") {
      defaultLabel = "Custom Task";
      defaultConfig = {};
    }

    dispatch(
      createNode({
        type,
        label: defaultLabel,
        config: defaultConfig,
        position: { x: posX, y: posY },
      })
    );
  };

  // Handle live node movement
  const handleMoveNode = useCallback(
    (id, x, y) => {
      dispatch(moveNodeLocal({ id, nodeId: id, x, y, position: { x, y } }));
    },
    [dispatch]
  );

  // Handle saving node position
  const handleSaveNodePosition = useCallback(
    (id, x, y) => {
      dispatch(updateNodePosition({ id, nodeId: id, position: { x, y } }));
    },
    [dispatch]
  );

  // Handle node selection: only selects node, does NOT open side drawer
  const handleSelectNode = useCallback(
    (id) => {
      dispatch(setSelectedNode(id));
    },
    [dispatch]
  );

  // Handle opening node text editor popup modal
  const handleOpenEdit = useCallback(
    (id) => {
      dispatch(openEditModal(id));
    },
    [dispatch]
  );

  // Handle closing node popup text editor
  const handleCloseEdit = useCallback(() => {
    dispatch(closeEditModal());
  }, [dispatch]);

  // Handle saving node text from popup (for Normal Nodes)
  const handleSaveNodeText = useCallback(
    async (id, text) => {
      await dispatch(updateNodeText({ id, text })).unwrap();
      dispatch(saveAutomation());
    },
    [dispatch]
  );

  // Handle saving Date / Time / Action node configuration from popup modal
  const handleSaveTriggerConfig = useCallback(
    async (id, config, defaultLabel) => {
      await dispatch(
        updateNodeConfig({
          nodeId: id,
          config,
          label: defaultLabel,
          status: "configured",
        })
      ).unwrap();
      dispatch(saveAutomation());
      dispatch(closeEditModal());
      setValidationBanner({
        type: "success",
        message: "Schedule configured! When the scheduled Date & Time arrives, this workflow will run automatically without needing to click the action node.",
      });
    },
    [dispatch]
  );

  // Handle deleting a node
  const handleDeleteNode = useCallback(
    (id) => {
      dispatch(deleteNode(id));
    },
    [dispatch]
  );

  // Handle connecting two nodes
  const handleConnect = useCallback(
    (source, target) => {
      dispatch(addEdge({ source, target }));
    },
    [dispatch]
  );

  // Handle deleting an edge
  const handleDeleteEdge = useCallback(
    (edgeId) => {
      dispatch(removeEdge(edgeId));
    },
    [dispatch]
  );

  // Save Automation Canvas
  const handleSaveCanvas = () => {
    dispatch(saveAutomation());
  };

  // Real AI Automation Execution Engine with Medium Speed Wire & Node Progression
  const handleExecuteWorkflow = useCallback(
    async (startNodeId, { isScheduled = false } = {}) => {
      if (isExecutingWorkflowRef.current) return;
      if (!nodes || !nodes.length) {
        setValidationBanner({
          type: "error",
          message: "No workflow nodes configured on canvas.",
        });
        return;
      }

      // Isolate the specific workflow connected to startNodeId
      const targetWorkflow = getWorkflowSubgraph(nodes, edges, startNodeId);
      const {
        nodes: workflowNodes,
        edges: workflowEdges,
        rootNode,
        rootTaskNode,
        directTaskNode,
        actionNode,
      } = targetWorkflow;

      if (!workflowNodes.length) {
        setValidationBanner({
          type: "error",
          message: "No connected nodes found for this workflow.",
        });
        return;
      }

      activeWorkflowRef.current = targetWorkflow;
      setActiveWorkflowNodeIds(workflowNodes.map((n) => n.id));
      isExecutingWorkflowRef.current = true;
      setIsExecutingWorkflow(true);
      setIsWorkflowPaused(false);
      setAllNodesBlue(false);

      // Reset execution states ONLY for nodes in this specific workflow
      const wfNodeIds = new Set(workflowNodes.map((n) => n.id));
      const wfEdgeIds = new Set(workflowEdges.map((e) => e.id));

      const initialCompleted = completedNodeIdsRef.current.filter((id) => !wfNodeIds.has(id));
      const initialCompletedEdges = completedEdgeIdsRef.current.filter((id) => !wfEdgeIds.has(id));
      completedNodeIdsRef.current = initialCompleted;
      completedEdgeIdsRef.current = initialCompletedEdges;
      setCompletedNodeIds(initialCompleted);
      setCompletedEdgeIds(initialCompletedEdges);
      setExecutingEdgeIds([]);
      setIsResultsPanelOpen(true);

      const workflowName =
        rootNode?.text?.trim()?.split("\n")[0] ||
        rootNode?.label ||
        "AI Workflow";

      setValidationBanner({
        type: "info",
        message: isScheduled
          ? `⏰ Scheduled workflow "${workflowName}" triggered! Executing nodes with AI Agent...`
          : `Starting execution for workflow "${workflowName}"...`,
      });

      // Helper to find edge connecting two node IDs in either direction within this workflow
      const findEdge = (id1, id2) => {
        return workflowEdges.find(
          (e) =>
            (e.source === id1 && e.target === id2) ||
            (e.source === id2 && e.target === id1)
        );
      };

      const dateNodes = workflowNodes.filter(
        (n) => n.type === "date" && n.id !== actionNode?.id && n.id !== rootNode?.id
      );
      const timeNodes = workflowNodes.filter(
        (n) => n.type === "time" && n.id !== actionNode?.id && n.id !== rootNode?.id
      );

      // --- STEP 1: Action Node starts with persistent loading spinner (Medium speed) ---
      if (actionNode) {
        setExecutingNodeId(actionNode.id);
        await new Promise((r) => setTimeout(r, 650));
      }

      // --- STEP 2: Blue line flows from Action node wire -> passes Date node ---
      for (const dNode of dateNodes) {
        const edgeToDate =
          findEdge(actionNode?.id, dNode.id) ||
          findEdge(rootNode?.id, dNode.id) ||
          workflowEdges.find((e) => e.source === dNode.id || e.target === dNode.id);

        if (edgeToDate) {
          const fromId = edgeToDate.target === dNode.id ? edgeToDate.source : edgeToDate.target;
          setExecutingEdgeIds([
            {
              edgeId: edgeToDate.id,
              fromNodeId: fromId,
              toNodeId: dNode.id,
            },
          ]);
        }
        await new Promise((r) => setTimeout(r, 850));
        setExecutingNodeId(dNode.id);
        setCompletedNodeIds((prev) => [...new Set([...prev, dNode.id])]);
        if (edgeToDate) {
          setCompletedEdgeIds((prev) => [...new Set([...prev, edgeToDate.id])]);
        }
        await new Promise((r) => setTimeout(r, 500));
        setExecutingEdgeIds([]);
      }

      // --- STEP 3: Blue line flows from Date node wire -> passes Time node ---
      for (const tNode of timeNodes) {
        const lastPassedId = dateNodes[dateNodes.length - 1]?.id || actionNode?.id;
        const edgeToTime =
          (lastPassedId && findEdge(lastPassedId, tNode.id)) ||
          findEdge(actionNode?.id, tNode.id) ||
          findEdge(rootNode?.id, tNode.id) ||
          workflowEdges.find((e) => e.source === tNode.id || e.target === tNode.id);

        if (edgeToTime) {
          const fromId = edgeToTime.target === tNode.id ? edgeToTime.source : edgeToTime.target;
          setExecutingEdgeIds([
            {
              edgeId: edgeToTime.id,
              fromNodeId: fromId,
              toNodeId: tNode.id,
            },
          ]);
        }
        await new Promise((r) => setTimeout(r, 850));
        setExecutingNodeId(tNode.id);
        setCompletedNodeIds((prev) => [...new Set([...prev, tNode.id])]);
        if (edgeToTime) {
          setCompletedEdgeIds((prev) => [...new Set([...prev, edgeToTime.id])]);
        }
        await new Promise((r) => setTimeout(r, 500));
        setExecutingEdgeIds([]);
      }

      // --- STEP 4: Blue line flows to Start Node (First Task Node) ---
      const firstTaskNode = directTaskNode || rootTaskNode || rootNode;
      if (firstTaskNode && actionNode && firstTaskNode.id !== actionNode.id) {
        const lastPassedId =
          timeNodes[timeNodes.length - 1]?.id ||
          dateNodes[dateNodes.length - 1]?.id ||
          actionNode.id;

        const edgeToRoot =
          findEdge(lastPassedId, firstTaskNode.id) ||
          findEdge(actionNode.id, firstTaskNode.id) ||
          workflowEdges.find(
            (e) =>
              (e.source === firstTaskNode.id && [lastPassedId, actionNode.id].includes(e.target)) ||
              (e.target === firstTaskNode.id && [lastPassedId, actionNode.id].includes(e.source))
          );

        if (edgeToRoot) {
          const fromId = edgeToRoot.target === firstTaskNode.id ? edgeToRoot.source : edgeToRoot.target;
          setExecutingEdgeIds([
            {
              edgeId: edgeToRoot.id,
              fromNodeId: fromId,
              toNodeId: firstTaskNode.id,
            },
          ]);
        }
        await new Promise((r) => setTimeout(r, 950)); // Arrive at Start node

        // Arrive at Start Node
        setExecutingNodeId(firstTaskNode.id);
        if (edgeToRoot) {
          const nextCompletedEdges = [...new Set([...completedEdgeIdsRef.current, edgeToRoot.id])];
          completedEdgeIdsRef.current = nextCompletedEdges;
          setCompletedEdgeIds(nextCompletedEdges);
        }
        await new Promise((r) => setTimeout(r, 450));
      } else if (firstTaskNode) {
        setExecutingNodeId(firstTaskNode.id);
      }

      // Mark Action, Date, and Time nodes as validated/completed for this run
      const preludeIds = [actionNode?.id, ...dateNodes.map((d) => d.id), ...timeNodes.map((t) => t.id)].filter(
        Boolean
      );
      const nextCompletedNodes = [...new Set([...completedNodeIdsRef.current, ...preludeIds])];
      completedNodeIdsRef.current = nextCompletedNodes;
      setCompletedNodeIds(nextCompletedNodes);

      // All edges from circular prelude nodes to firstTaskNode marked completed solid blue
      const preludeEdges = workflowEdges.filter(
        (e) => (preludeIds.includes(e.source) && e.target === firstTaskNode?.id) ||
               (preludeIds.includes(e.target) && e.source === firstTaskNode?.id)
      );
      if (preludeEdges.length > 0) {
        const nextEdgeIds = [...new Set([...completedEdgeIdsRef.current, ...preludeEdges.map((e) => e.id)])];
        completedEdgeIdsRef.current = nextEdgeIds;
        setCompletedEdgeIds(nextEdgeIds);
      }

      // --- STEP 5: Start Node executes its task and moves forward to next nodes on backend ---
      // (This prelude only happens ONCE! Backend executes the Start Node task, then subsequent task nodes)
      try {
        const response = await aiAutomationApi.startExecution({
          startNodeId: actionNode?.id || startNodeId || firstTaskNode?.id || rootNode?.id,
          workflowNodeIds: workflowNodes.map((n) => n.id),
          nodes,
          edges,
        });
        if (response.data?.success) {
          const exec = response.data.execution;
          setCurrentExecution(exec);
          const initialStatus = {};
          (exec.nodes || []).forEach((n) => {
            initialStatus[n.nodeId] = {
              status: n.status || "pending",
              input: n.input,
              output: n.output,
              error: n.error,
              startedAt: n.startedAt,
              completedAt: n.completedAt,
              durationMs: n.durationMs,
            };
          });
          setNodeStatusMap((prev) => ({ ...prev, ...initialStatus }));
        } else {
          throw new Error(response.data?.message || "Failed to start workflow execution");
        }
      } catch (err) {
        console.error("[AiAutomation] Execution launch error:", err);
        setIsExecutingWorkflow(false);
        isExecutingWorkflowRef.current = false;
        setActiveWorkflowNodeIds([]);
        setValidationBanner({
          type: "error",
          message: err.response?.data?.message || err.message || "Failed to execute workflow",
        });
      }
    },
    [nodes, edges]
  );

  // Pause / Resume Execution Handler
  const handleTogglePauseResume = useCallback(async () => {
    if (!isExecutingWorkflow && !isWorkflowPaused) {
      handleExecuteWorkflow();
      return;
    }

    const executionId = currentExecution?.executionId;
    if (!executionId) return;

    try {
      if (isWorkflowPaused) {
        setValidationBanner({
          type: "info",
          message: "Resuming workflow execution...",
        });
        await aiAutomationApi.resumeExecution(executionId);
        setIsWorkflowPaused(false);
      } else if (isExecutingWorkflow) {
        setValidationBanner({
          type: "info",
          message: "Pausing workflow execution safely at next checkpoint...",
        });
        await aiAutomationApi.pauseExecution(executionId);
        setIsWorkflowPaused(true);
      }
    } catch (err) {
      console.error("[AiAutomation] Pause/Resume error:", err);
      setValidationBanner({
        type: "error",
        message: err.response?.data?.message || err.message || "Failed to toggle execution state",
      });
    }
  }, [currentExecution, isWorkflowPaused, isExecutingWorkflow, handleExecuteWorkflow]);

  // Retry Failed Node Handler
  const handleRetryNode = useCallback(
    async (nodeId) => {
      const executionId = currentExecution?.executionId;
      if (!executionId || !nodeId) return;

      try {
        setValidationBanner({
          type: "info",
          message: `Retrying execution from node...`,
        });
        setIsExecutingWorkflow(true);
        isExecutingWorkflowRef.current = true;
        setIsWorkflowPaused(false);

        setNodeStatusMap((prev) => ({
          ...prev,
          [nodeId]: {
            ...(prev[nodeId] || {}),
            status: "running",
            error: null,
          },
        }));

        await aiAutomationApi.retryNodeExecution(executionId, nodeId);
      } catch (err) {
        console.error("[AiAutomation] Retry node error:", err);
        setValidationBanner({
          type: "error",
          message: err.response?.data?.message || err.message || "Failed to retry node execution",
        });
      }
    },
    [currentExecution]
  );

  // Real-time Socket.IO listener for live workflow execution lifecycle events
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleExecutionUpdate = (payload) => {
      if (!payload) return;
      const { event, executionId, nodeId, node, execution, error } = payload;

      if (event === "started") {
        setIsExecutingWorkflow(true);
        isExecutingWorkflowRef.current = true;
        setIsWorkflowPaused(false);
        if (execution) {
          setCurrentExecution(execution);
          const initialStatus = {};
          (execution.nodes || []).forEach((n) => {
            initialStatus[n.nodeId] = {
              status: n.status || "pending",
              input: n.input,
              output: n.output,
              error: n.error,
              startedAt: n.startedAt,
              completedAt: n.completedAt,
              durationMs: n.durationMs,
            };
          });
          setNodeStatusMap((prev) => ({ ...prev, ...initialStatus }));
        }
        // Preserve validated prelude nodes (Action, Date, Time) from execution payload
        const completedFromExec = (execution?.nodes || [])
          .filter((n) => n.status === "completed")
          .map((n) => n.nodeId);
        const mergedCompleted = [...new Set([...completedNodeIdsRef.current, ...completedFromExec])];
        completedNodeIdsRef.current = mergedCompleted;
        setCompletedNodeIds(mergedCompleted);
        setExecutingNodeId(null);
        setExecutingEdgeIds([]);
      } else if (event === "node_started") {
        setIsExecutingWorkflow(true);
        isExecutingWorkflowRef.current = true;
        setExecutingNodeId(nodeId);

        // Animate wire leading to this node from the upstream completed node
        const allEdges = edgesRef.current || [];
        const completedIds = completedNodeIdsRef.current || [];
        const incomingEdges = allEdges.filter((e) => {
          return (e.target === nodeId && completedIds.includes(e.source)) ||
                 (e.source === nodeId && completedIds.includes(e.target));
        });

        if (incomingEdges.length > 0) {
          setExecutingEdgeIds(
            incomingEdges.map((e) => ({
              edgeId: e.id,
              fromNodeId: e.target === nodeId ? e.source : e.target,
              toNodeId: nodeId,
            }))
          );
        }

        setNodeStatusMap((prev) => ({
          ...prev,
          [nodeId]: {
            ...(prev[nodeId] || {}),
            status: "running",
            startedAt: node?.startedAt || new Date().toISOString(),
          },
        }));

        setCurrentExecution((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            status: "running",
            nodes: (prev.nodes || []).map((n) =>
              n.nodeId === nodeId
                ? { ...n, status: "running", startedAt: node?.startedAt || new Date().toISOString() }
                : n
            ),
          };
        });
      } else if (event === "node_completed") {
        setNodeStatusMap((prev) => ({
          ...prev,
          [nodeId]: {
            ...(prev[nodeId] || {}),
            status: "completed",
            output: node?.output,
            completedAt: node?.completedAt || new Date().toISOString(),
            durationMs: node?.durationMs,
          },
        }));

        const newCompleted = [...new Set([...completedNodeIdsRef.current, nodeId])];
        completedNodeIdsRef.current = newCompleted;
        setCompletedNodeIds(newCompleted);

        const allEdges = edgesRef.current || [];

        // Transition incoming wire(s) to completed solid blue
        const incomingEdges = allEdges.filter((e) => {
          return (e.target === nodeId && newCompleted.includes(e.source)) ||
                 (e.source === nodeId && newCompleted.includes(e.target)) ||
                 e.target === nodeId ||
                 e.source === nodeId;
        });
        if (incomingEdges.length > 0) {
          const incomingIds = incomingEdges.map((e) => e.id);
          const newCompletedEdges = [...new Set([...completedEdgeIdsRef.current, ...incomingIds])];
          completedEdgeIdsRef.current = newCompletedEdges;
          setCompletedEdgeIds(newCompletedEdges);
        }

        // IMMEDIATELY activate outgoing wire(s) leading to the next uncompleted node(s) with moving blue line!
        const outgoingEdges = allEdges.filter((e) => {
          const otherId = e.source === nodeId ? e.target : e.source;
          return (e.source === nodeId || e.target === nodeId) && !newCompleted.includes(otherId) && otherId !== nodeId;
        });

        if (outgoingEdges.length > 0) {
          setExecutingEdgeIds(
            outgoingEdges.map((e) => ({
              edgeId: e.id,
              fromNodeId: nodeId,
              toNodeId: e.source === nodeId ? e.target : e.source,
            }))
          );
        } else {
          setExecutingEdgeIds([]);
        }

        setCurrentExecution((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            successfulNodes: (prev.successfulNodes || 0) + 1,
            nodes: (prev.nodes || []).map((n) =>
              n.nodeId === nodeId ? { ...n, ...node, status: "completed" } : n
            ),
          };
        });
      } else if (event === "node_failed") {
        setNodeStatusMap((prev) => ({
          ...prev,
          [nodeId]: {
            ...(prev[nodeId] || {}),
            status: "failed",
            error: error || node?.error,
            completedAt: node?.completedAt || new Date().toISOString(),
          },
        }));

        setExecutingNodeId(null);
        setExecutingEdgeIds([]);
        setIsExecutingWorkflow(false);
        isExecutingWorkflowRef.current = false;

        setCurrentExecution((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            status: "failed",
            failedNodes: (prev.failedNodes || 0) + 1,
            errorSummary: error || node?.error?.message || "Execution error",
            nodes: (prev.nodes || []).map((n) =>
              n.nodeId === nodeId ? { ...n, ...node, status: "failed", error: error || node?.error } : n
            ),
          };
        });

        setValidationBanner({
          type: "error",
          message: `Node execution failed: ${error || node?.error?.message || "Unknown error"}. You can retry this node.`,
        });
      } else if (event === "paused") {
        setIsWorkflowPaused(true);
        if (nodeId) {
          setNodeStatusMap((prev) => ({
            ...prev,
            [nodeId]: {
              ...(prev[nodeId] || {}),
              status: "paused",
            },
          }));
        }
        setCurrentExecution((prev) => (prev ? { ...prev, status: "paused" } : prev));
      } else if (event === "resumed") {
        setIsWorkflowPaused(false);
        if (nodeId) {
          setNodeStatusMap((prev) => ({
            ...prev,
            [nodeId]: {
              ...(prev[nodeId] || {}),
              status: "running",
            },
          }));
        }
        setCurrentExecution((prev) => (prev ? { ...prev, status: "running" } : prev));
      } else if (event === "completed") {
        if (execution) {
          setCurrentExecution(execution);
        }
        setIsExecutingWorkflow(false);
        isExecutingWorkflowRef.current = false;
        setIsWorkflowPaused(false);
        setExecutingNodeId(null);
        setExecutingEdgeIds([]);
        setActiveWorkflowNodeIds([]);

        if (execution?.status === "completed") {
          // Keep all executed workflow edges in solid blue
          const wfEdges = activeWorkflowRef.current?.edges || edgesRef.current || [];
          if (wfEdges.length > 0) {
            const edgeIds = wfEdges.map((e) => e.id);
            const nextCompletedEdges = [...new Set([...completedEdgeIdsRef.current, ...edgeIds])];
            completedEdgeIdsRef.current = nextCompletedEdges;
            setCompletedEdgeIds(nextCompletedEdges);
          }
          setValidationBanner({
            type: "success",
            message: `Workflow completed successfully! ${execution?.successfulNodes || 0} nodes executed.`,
          });
        }
      }
    };

    const handleScheduledRun = (payload) => {
      console.log("[AiAutomation] ⏰ Scheduled run notification from server:", payload);
      // Notification update only; do not re-trigger execution flow
      if (payload?.executionId) {
        setValidationBanner({
          type: "info",
          message: `⏰ Scheduled workflow run active [ID: ${payload.executionId}]`,
        });
      }
    };

    socket.on("automation:execution_update", handleExecutionUpdate);
    socket.on("automation:scheduled_start", handleScheduledRun);
    socket.on("automation:scheduled_run", handleScheduledRun);

    return () => {
      socket.off("automation:execution_update", handleExecutionUpdate);
      socket.off("automation:scheduled_start", handleScheduledRun);
      socket.off("automation:scheduled_run", handleScheduledRun);
    };
  }, [handleExecuteWorkflow]);

  // Automatic Client-side Scheduler: Checks every 4 seconds if the configured Date & Time match current time
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isActive) return;
      if (isExecutingWorkflowRef.current) return;
      if (!nodes || !nodes.length) return;

      const workflows = getAllWorkflowSubgraphs(nodes, edges);
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
      const currentDay = String(now.getDate()).padStart(2, "0");
      const currentDateStr = `${currentYear}-${currentMonth}-${currentDay}`;
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();
      const currentDayOfWeek = now.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();

      for (const sub of workflows) {
        const dateNode = sub.nodes.find((n) => n.type === "date");
        const timeNode = sub.nodes.find((n) => n.type === "time");

        // Needs at least a configured time node in this specific workflow
        if (!timeNode?.config?.time) continue;

        // Check Time Match
        const rawTime = String(timeNode.config.time || "").trim();
        let ampm = timeNode.config.ampm || null;
        let cleanTime = rawTime;
        if (/pm/i.test(cleanTime)) {
          ampm = "PM";
          cleanTime = cleanTime.replace(/pm/i, "").trim();
        } else if (/am/i.test(cleanTime)) {
          ampm = "AM";
          cleanTime = cleanTime.replace(/am/i, "").trim();
        }

        const parts = cleanTime.split(":");
        let targetHour = parseInt(parts[0], 10);
        let targetMin = parseInt(parts[1], 10);
        if (isNaN(targetHour) || isNaN(targetMin)) continue;

        if (ampm === "PM" && targetHour < 12) targetHour += 12;
        if (ampm === "AM" && targetHour === 12) targetHour = 0;

        if (currentHours !== targetHour || currentMinutes !== targetMin) {
          continue;
        }

        // Check Date Match (if dateNode is present in this workflow)
        if (dateNode?.config) {
          const mode = dateNode.config.dateType || dateNode.config.dateMode || "specific";
          if (mode === "specific") {
            let targetDate = (dateNode.config.specificDate || "").trim();
            if (targetDate) {
              const dParts = targetDate.split("-");
              if (dParts.length === 3) {
                targetDate = `${dParts[0]}-${String(dParts[1]).padStart(2, "0")}-${String(dParts[2]).padStart(2, "0")}`;
              }
              if (currentDateStr !== targetDate) continue;
            }
          } else if (mode === "recurring") {
            const pattern = dateNode.config.recurrencePattern || dateNode.config.recurringPattern || "every_day";
            if (pattern === "every_week") {
              const days = Array.isArray(dateNode.config.selectedDaysOfWeek)
                ? dateNode.config.selectedDaysOfWeek
                : [dateNode.config.selectedDayOfWeek || "Monday"];
              const matchDay = days.some((d) => d && currentDayOfWeek === d.toLowerCase());
              if (!matchDay) continue;
            } else if (pattern === "every_month") {
              const targetDayOfMonth = parseInt(dateNode.config.dayOfMonth, 10);
              if (!isNaN(targetDayOfMonth) && now.getDate() !== targetDayOfMonth) continue;
            }
          }
        }

        // Unique run key per workflow and per minute
        const workflowKey = (sub.rootNode?.id || "wf") + `_${currentDateStr} ${String(currentHours).padStart(2, "0")}:${String(currentMinutes).padStart(2, "0")}`;
        if (lastScheduledRunKeyRef.current === workflowKey) {
          continue;
        }

        lastScheduledRunKeyRef.current = workflowKey;
        console.log(
          `[AiAutomation] ⏰ Scheduled Date & Time arrived for workflow "${sub.workflowName || sub.rootNode?.label || ""}". Automatically executing workflow without clicking action node!`
        );

        const actionNode = sub.actionNode || sub.nodes.find((n) => n.type === "action") || sub.nodes[0];
        if (actionNode) {
          handleExecuteWorkflow(actionNode.id, { isScheduled: true });
          break; // Process one at a time
        }
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [nodes, edges, handleExecuteWorkflow, isActive]);


  // Run Now (Execute immediately on real backend + visual sequential flow)
  const handleRunNow = async () => {
    setValidationBanner(null);
    let targetStartId = null;

    if (selectedNodeId) {
      const targetWf = getWorkflowSubgraph(nodes, edges, selectedNodeId);
      targetStartId = targetWf.actionNode?.id || targetWf.directTaskNode?.id || targetWf.rootTaskNode?.id || targetWf.rootNode?.id || selectedNodeId;
    }

    if (!targetStartId) {
      const actionNode = nodes.find((n) => n.type === "action") || nodes[0];
      targetStartId = actionNode?.id;
    }

    if (targetStartId) {
      handleExecuteWorkflow(targetStartId);
    } else {
      const result = await dispatch(runNowAutomation());
      if (result.error) {
        setValidationBanner({
          type: "error",
          message: result.payload || "Run Now failed. Please review your workflow configuration.",
        });
      }
    }
  };

  // Activate / Deactivate Toggle
  const handleToggleActive = async () => {
    setValidationBanner(null);
    const result = await dispatch(toggleActiveAutomation());
    if (result.error) {
      setValidationBanner({
        type: "error",
        message: result.payload || "Could not activate automation. Please review validation errors.",
      });
    }
  };

  return (
    <div
      className="page-pad ai-automation-page"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: "calc(100vh - 40px)",
        padding: "16px 20px 20px 20px",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Top Header Bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          flexShrink: 0,
        }}
      >
        {/* Title and Automation Status */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              backgroundColor: "#F5F3FF",
              color: "#7C3AED",
              border: "1px solid #DDD6FE",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 6px rgba(124, 58, 237, 0.12)",
            }}
          >
            <Zap size={22} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  color: "#0F172A",
                  margin: 0,
                  letterSpacing: "-0.02em",
                }}
              >
                AI Automation
              </h1>

              {/* Status Badge */}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "3px 8px",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  backgroundColor: isActive ? "#DCFCE7" : "#F1F5F9",
                  color: isActive ? "#15803D" : "#64748B",
                  border: `1px solid ${isActive ? "#86EFAC" : "#E2E8F0"}`,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    backgroundColor: isActive ? "#16A34A" : "#94A3B8",
                  }}
                />
                {isActive ? "Active Schedule" : "Inactive"}
              </span>
            </div>
            <p
              style={{
                fontSize: "12px",
                color: "#64748B",
                margin: 0,
                marginTop: 2,
              }}
            >
              Trigger ➔ Date, Action, Time independent branches
              {nextRunAt && isActive && (
                <span style={{ color: "#2563EB", marginLeft: 8 }}>
                  • Next run: {new Date(nextRunAt).toLocaleString()}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Action Controls - Execution Controls, Results Panel, Normal Node and Trigger */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Live Execution Results Panel Toggle Button */}
          <button
            type="button"
            onClick={() => setIsResultsPanelOpen((prev) => !prev)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "8px 14px",
              borderRadius: 8,
              border: isResultsPanelOpen ? "1.5px solid #0081FB" : "1px solid #CBD5E1",
              backgroundColor: isResultsPanelOpen ? "#EFF6FF" : "#FFFFFF",
              color: isResultsPanelOpen ? "#0081FB" : "#0F172A",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
              transition: "all 0.15s ease",
            }}
            title="Toggle Live Execution Results Panel"
          >
            <Terminal size={15} color={isResultsPanelOpen ? "#0081FB" : "#64748B"} />
            <span>Execution Results</span>
            {isExecutingWorkflow && (
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: "#0081FB",
                  display: "inline-block",
                  boxShadow: "0 0 0 3px rgba(0, 129, 251, 0.25)",
                }}
              />
            )}
            {currentExecution?.status === "completed" && !isExecutingWorkflow && (
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: "#10B981",
                  display: "inline-block",
                }}
              />
            )}
            {currentExecution?.status === "failed" && !isExecutingWorkflow && (
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: "#EF4444",
                  display: "inline-block",
                }}
              />
            )}
          </button>

          {/* Separate Add Normal Node Button */}
          <button
            type="button"
            onClick={() => handleCreateTypedNode("generic")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid #CBD5E1",
              backgroundColor: "#FFFFFF",
              color: "#0F172A",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#F8FAFC";
              e.currentTarget.style.borderColor = "#94A3B8";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#FFFFFF";
              e.currentTarget.style.borderColor = "#CBD5E1";
            }}
          >
            <Plus size={15} color="#0081FB" />
            Normal Node
          </button>

          {/* Trigger Dropdown Button with options: Date, Action, Time */}
          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setIsTriggerMenuOpen((prev) => !prev)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                borderRadius: 8,
                border: "none",
                backgroundColor: "#0081FB",
                color: "#FFFFFF",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(0, 129, 251, 0.25)",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#006FD0";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#0081FB";
              }}
            >
              <Zap size={15} />
              Trigger
              <ChevronDown size={14} />
            </button>

            {/* Dropdown Menu */}
            {isTriggerMenuOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  width: 230,
                  backgroundColor: "#FFFFFF",
                  borderRadius: 12,
                  border: "1px solid #E2E8F0",
                  boxShadow: "0 10px 25px rgba(15, 23, 42, 0.12)",
                  padding: "6px",
                  zIndex: 200,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                {/* 1. Add Date Node */}
                <button
                  type="button"
                  onClick={() => handleCreateTypedNode("date")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "none",
                    backgroundColor: "transparent",
                    color: "#2563EB",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#EFF6FF")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <Calendar size={16} color="#2563EB" />
                  <div style={{ flex: 1 }}>
                    <div>+ Date Node</div>
                    <div style={{ fontSize: 11, color: "#64748B", fontWeight: 400 }}>
                      Specific or recurring date
                    </div>
                  </div>
                </button>

                {/* 3. Add Action Node */}
                <button
                  type="button"
                  onClick={() => handleCreateTypedNode("action")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "none",
                    backgroundColor: "transparent",
                    color: "#059669",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#ECFDF5")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <Play size={16} color="#059669" />
                  <div style={{ flex: 1 }}>
                    <div>+ Action Node</div>
                    <div style={{ fontSize: 11, color: "#64748B", fontWeight: 400 }}>
                      Task, notification, or AI
                    </div>
                  </div>
                </button>

                {/* 4. Add Time Node */}
                <button
                  type="button"
                  onClick={() => handleCreateTypedNode("time")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "none",
                    backgroundColor: "transparent",
                    color: "#D97706",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#FFFBEB")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <Clock size={16} color="#D97706" />
                  <div style={{ flex: 1 }}>
                    <div>+ Time Node</div>
                    <div style={{ fontSize: 11, color: "#64748B", fontWeight: 400 }}>
                      Time & repeat interval
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Validation Banner / Notification */}
      {validationBanner && (
        <div
          style={{
            marginBottom: 10,
            padding: "10px 16px",
            borderRadius: 10,
            backgroundColor:
              validationBanner.type === "error" ? "#FEF2F2" : "#F0FDF4",
            border: `1px solid ${
              validationBanner.type === "error" ? "#FCA5A5" : "#86EFAC"
            }`,
            color: validationBanner.type === "error" ? "#991B1B" : "#166534",
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={16} />
            <span>{validationBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setValidationBanner(null)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 2,
              color: "inherit",
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Main Canvas Area */}
      <div
        style={{
          flex: 1,
          position: "relative",
          borderRadius: 14,
          border: "1px solid #E2E8F0",
          backgroundColor: "#FFFFFF",
          overflow: "hidden",
          boxShadow:
            "0 1px 3px rgba(0, 0, 0, 0.02), 0 4px 12px rgba(0, 0, 0, 0.03)",
        }}
      >
        {loading && nodes.length === 0 ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              backgroundColor: "#FAFBFD",
              zIndex: 50,
            }}
          >
            <Loader2 size={28} className="animate-spin" color="#0081FB" />
            <span style={{ fontSize: 13, color: "#64748B" }}>
              Loading AI Automation Canvas...
            </span>
          </div>
        ) : (
          <AiAutomationCanvas
            nodes={nodes}
            edges={edges}
            selectedNodeId={selectedNodeId}
            executingNodeId={executingNodeId}
            executingEdgeIds={executingEdgeIds}
            completedNodeIds={completedNodeIds}
            completedEdgeIds={completedEdgeIds}
            nodeStatusMap={nodeStatusMap}
            isWorkflowRunning={isExecutingWorkflow}
            isWorkflowPaused={isWorkflowPaused}
            activeWorkflowNodeIds={activeWorkflowNodeIds}
            isWorkflowCompleted={currentExecution?.status === "completed"}
            allNodesBlue={allNodesBlue}
            onTogglePauseResume={handleTogglePauseResume}
            onRetryNode={handleRetryNode}
            onExecuteWorkflow={handleExecuteWorkflow}
            connectionAlert={connectionAlert}
            onClearConnectionAlert={() => dispatch(clearConnectionAlert())}
            onInvalidConnection={(msg) => dispatch(setConnectionAlert(msg))}
            onSelectNode={handleSelectNode}
            onOpenEdit={handleOpenEdit}
            onMoveNode={handleMoveNode}
            onSaveNodePosition={handleSaveNodePosition}
            onDeleteNode={handleDeleteNode}
            onConnect={handleConnect}
            onDeleteEdge={handleDeleteEdge}
            onAddNode={handleCreateTypedNode}
            onCursorMove={handleCursorMove}
            onCanvasClick={handleCanvasClick}
            onViewportChange={handleViewportChange}
          />
        )}
      </div>

      {/* Live Execution Results Panel Drawer */}
      <ExecutionResultsPanel
        isOpen={isResultsPanelOpen}
        onClose={() => setIsResultsPanelOpen(false)}
        execution={currentExecution}
        isExecuting={isExecutingWorkflow}
        isPaused={isWorkflowPaused}
        onPause={handleTogglePauseResume}
        onResume={handleTogglePauseResume}
        onRunNow={() => {
          const targetWf = (selectedNodeId && getWorkflowSubgraph(nodes, edges, selectedNodeId)) || activeWorkflowRef.current;
          const targetId = targetWf?.actionNode?.id || targetWf?.directTaskNode?.id || targetWf?.rootTaskNode?.id || targetWf?.rootNode?.id;
          handleExecuteWorkflow(targetId);
        }}
      />

      {/* Execution History Modal */}
      <ExecutionHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
      />

      {/* Node Text Editing Popup Modal (for Normal Nodes) */}
      <NodeTextEditorModal
        isOpen={
          modalOpen &&
          (!activeEditingNode?.type ||
            activeEditingNode?.type === "generic" ||
            activeEditingNode?.type === "trigger")
        }
        node={activeEditingNode}
        isSaving={saving}
        onClose={handleCloseEdit}
        onSave={handleSaveNodeText}
      />

      {/* Trigger Branch Configuration Modal (for Date and Time Circular Nodes only - NOT Action Node) */}
      <TriggerNodeConfigModal
        isOpen={
          modalOpen &&
          (activeEditingNode?.type === "date" ||
            activeEditingNode?.type === "time")
        }
        node={activeEditingNode}
        isSaving={saving}
        onClose={handleCloseEdit}
        onSave={handleSaveTriggerConfig}
        onDelete={(id) => {
          handleDeleteNode(id);
          handleCloseEdit();
        }}
      />
    </div>
  );
};

export default AiAutomation;
