import AiAutomation from "../../models/aiAutomationModel.js";
import AutomationExecution from "../../models/automationExecutionModel.js";
import ActionExecutor from "./actionExecutor.js";
import { runAgentChat } from "../../controller/chat.controller.js";
import { AiAgentOrchestrator } from "../agent/aiAgentOrchestrator.js";
import { getIo } from "../../socket/index.js";

/**
 * Sanitize sensitive keys (passwords, tokens, api keys, secret headers)
 */
/**
 * Sanitize sensitive keys (passwords, tokens, api keys, secret headers)
 * Protected against circular references and deep call stack overflows.
 */
export const sanitizePayload = (data, seen = new WeakSet(), depth = 0) => {
  if (data === null || data === undefined) return data;
  if (typeof data !== "object") return data;

  // Prevent infinite call stack on deeply nested structures
  if (depth > 8) {
    return "[Truncated]";
  }

  // Prevent circular references
  if (seen.has(data)) {
    return "[Circular]";
  }
  seen.add(data);

  // Handle standard primitives and native objects
  if (data instanceof Date) return data.toISOString();
  if (data instanceof RegExp) return data.toString();
  if (data instanceof Error) {
    return {
      message: data.message,
      name: data.name,
      code: data.code,
      stack: depth <= 1 ? data.stack : undefined,
    };
  }

  // Convert Mongoose documents or objects with custom toObject/toJSON
  if (typeof data.toObject === "function") {
    try {
      data = data.toObject();
    } catch {
      // ignore
    }
  } else if (typeof data.toJSON === "function" && !(data instanceof Date)) {
    try {
      data = data.toJSON();
    } catch {
      // ignore
    }
  }

  if (typeof data !== "object" || data === null) return data;

  const SENSITIVE_KEYS = new Set([
    "password",
    "token",
    "secret",
    "authorization",
    "auth",
    "cookie",
    "apikey",
    "api_key",
    "accesstoken",
    "access_token",
    "refreshtoken",
    "refresh_token",
    "credential",
    "credentials",
    "private_key",
  ]);

  const IGNORED_INTERNAL_KEYS = new Set([
    "$__",
    "__v",
    "_doc",
    "$isNew",
    "_events",
    "_eventsCount",
    "socket",
    "_socket",
    "client",
    "db",
    "collection",
    "topology",
    "parser",
    "_httpMessage",
  ]);

  if (Array.isArray(data)) {
    try {
      return data.slice(0, 100).map((item) => sanitizePayload(item, seen, depth + 1));
    } finally {
      seen.delete(data);
    }
  }

  const clean = {};
  try {
    for (const [key, val] of Object.entries(data)) {
      if (IGNORED_INTERNAL_KEYS.has(key)) {
        continue;
      }
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        clean[key] = "[REDACTED]";
      } else if (typeof val === "object" && val !== null) {
        clean[key] = sanitizePayload(val, seen, depth + 1);
      } else {
        clean[key] = val;
      }
    }
    return clean;
  } finally {
    seen.delete(data);
  }
};

/**
 * Extract connected workflow component (subgraph) containing startNodeId.
 * On a canvas with multiple workflows, this isolates ONLY the nodes and edges
 * belonging to the targeted workflow.
 */
export const getWorkflowSubgraph = (nodes = [], edges = [], startNodeId = null) => {
  if (!nodes.length) return { nodes: [], edges: [], rootNode: null, workflowName: "AI Workflow" };

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Build undirected adjacency map to find the connected component
  const undirectedAdj = new Map();
  nodes.forEach((n) => undirectedAdj.set(n.id, []));
  edges.forEach((e) => {
    if (undirectedAdj.has(e.source) && undirectedAdj.has(e.target)) {
      undirectedAdj.get(e.source).push(e.target);
      undirectedAdj.get(e.target).push(e.source);
    }
  });

  // Pick seed node
  let seedNodeId = startNodeId;
  if (!seedNodeId || !nodeMap.has(seedNodeId)) {
    const trigger = nodes.find((n) => n.type === "trigger");
    const action = nodes.find((n) => n.type === "action");
    seedNodeId = trigger?.id || action?.id || nodes[0]?.id;
  }

  // BFS to gather all connected nodes in this specific workflow
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

  // Identify root Trigger or Action node for this specific workflow
  const triggerNode = workflowNodes.find((n) => n.type === "trigger");
  const actionNode =
    workflowNodes.find((n) => n.id === startNodeId && n.type === "action") ||
    workflowNodes.find((n) => n.type === "action");

  // Determine the primary task node directly connected to actionNode, dateNode, or timeNode
  let directTaskNode = null;
  const circularIds = new Set(
    workflowNodes
      .filter((n) => n.type === "action" || n.type === "date" || n.type === "time")
      .map((n) => n.id)
  );

  const preludeSeedIds = [actionNode?.id].filter(Boolean);

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

  const taskCandidates = workflowNodes.filter(
    (n) => n.type !== "action" && n.type !== "date" && n.type !== "time"
  );
  taskCandidates.sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0));

  const rootTaskNode = directTaskNode || triggerNode || taskCandidates[0] || workflowNodes[0];
  const rootNode = directTaskNode || triggerNode || actionNode || taskCandidates[0] || workflowNodes[0];

  // Derive human-readable workflow name from the Start/Trigger node or the first task node
  let workflowName = "Workflow";
  if (rootTaskNode?.text && rootTaskNode.text.trim()) {
    workflowName = rootTaskNode.text.trim().split("\n")[0].substring(0, 45);
  } else if (rootTaskNode?.label && rootTaskNode.label.trim()) {
    workflowName = rootTaskNode.label.trim().substring(0, 45);
  } else if (triggerNode?.text && triggerNode.text.trim()) {
    workflowName = triggerNode.text.trim().split("\n")[0].substring(0, 45);
  } else if (actionNode?.label) {
    workflowName = actionNode.label;
  }

  return {
    nodes: workflowNodes,
    edges: workflowEdges,
    rootNode,
    rootTaskNode,
    directTaskNode,
    triggerNode,
    actionNode,
    workflowName,
  };
};

/**
 * Partition all nodes and edges on a canvas into distinct, independent workflow subgraphs.
 */
export const getAllWorkflowSubgraphs = (nodes = [], edges = []) => {
  if (!nodes || nodes.length === 0) return [];

  const visitedNodeIds = new Set();
  const workflows = [];

  // Seed with all trigger and action nodes first
  const seedNodes = nodes.filter((n) => n.type === "trigger" || n.type === "action");

  for (const seed of seedNodes) {
    if (visitedNodeIds.has(seed.id)) continue;
    const sub = getWorkflowSubgraph(nodes, edges, seed.id);
    for (const n of sub.nodes) {
      visitedNodeIds.add(n.id);
    }
    if (sub.nodes.length > 0) {
      workflows.push(sub);
    }
  }

  // Any remaining disconnected nodes
  for (const n of nodes) {
    if (!visitedNodeIds.has(n.id)) {
      const sub = getWorkflowSubgraph(nodes, edges, n.id);
      for (const node of sub.nodes) {
        visitedNodeIds.add(node.id);
      }
      if (sub.nodes.length > 0) {
        workflows.push(sub);
      }
    }
  }

  return workflows;
};

/**
 * Build topological sequence of nodes for a specific workflow
 */
export const buildExecutionOrder = (nodes = [], edges = [], startNodeId = null) => {
  if (!nodes.length) return [];

  // Isolate the connected workflow subgraph
  const {
    nodes: workflowNodes,
    edges: workflowEdges,
    rootNode,
    rootTaskNode,
    directTaskNode,
    triggerNode,
    actionNode,
  } = getWorkflowSubgraph(nodes, edges, startNodeId);

  if (!workflowNodes.length) return [];

  // Prelude nodes (date, time, action) when positioned upstream or as triggers
  // An action node is prelude ONLY if it acts as a trigger/upstream connected to task nodes.
  // Downstream action nodes (e.g. task -> action) are executable action tasks.
  const isDownstreamAction = (node) => {
    if (!node || node.type !== "action") return false;
    // If it's connected to rootTaskNode and positioned to the left of rootTaskNode, it's UPSTREAM trigger!
    if (rootTaskNode && rootTaskNode.id !== node.id && node.position && rootTaskNode.position) {
      if ((node.position.x ?? 0) < (rootTaskNode.position.x ?? 0)) {
        return false;
      }
    }
    const hasIncomingTaskEdge = workflowEdges.some((e) => {
      if (e.target !== node.id) return false;
      const src = workflowNodes.find((n) => n.id === e.source);
      return src && src.type !== "date" && src.type !== "time" && src.type !== "action";
    });
    return hasIncomingTaskEdge;
  };

  const isTaskNode = (n) => {
    if (!n) return false;
    if (n.type === "date" || n.type === "time") return false;
    if (n.type === "action" && !isDownstreamAction(n)) return false;
    return true;
  };

  const taskNodes = workflowNodes.filter(isTaskNode);
  if (!taskNodes.length) {
    return workflowNodes.filter((n) => n.type === "action" || n.type === "trigger");
  }

  const taskNodeMap = new Map(taskNodes.map((n) => [n.id, n]));
  const adj = new Map();
  const inDegree = new Map();

  taskNodes.forEach((n) => {
    adj.set(n.id, []);
    inDegree.set(n.id, 0);
  });

  const targetTaskNode =
    (rootTaskNode && taskNodeMap.get(rootTaskNode.id)) ||
    (directTaskNode && taskNodeMap.get(directTaskNode.id)) ||
    (triggerNode && taskNodeMap.get(triggerNode.id)) ||
    (startNodeId && taskNodeMap.get(startNodeId)) ||
    taskNodes[0];

  // Respect explicit directed edges (edge.source -> edge.target) across connected task nodes
  workflowEdges.forEach((e) => {
    if (taskNodeMap.has(e.source) && taskNodeMap.has(e.target) && e.source !== e.target) {
      adj.get(e.source).push(e.target);
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    }
  });

  // Seed topological BFS with all zero-in-degree task roots (prioritizing targetTaskNode when eligible)
  const zeroInDegreeRoots = taskNodes
    .filter((n) => (inDegree.get(n.id) || 0) === 0)
    .sort((a, b) => {
      if (targetTaskNode && a.id === targetTaskNode.id) return -1;
      if (targetTaskNode && b.id === targetTaskNode.id) return 1;
      if ((a.position?.x ?? 0) !== (b.position?.x ?? 0)) {
        return (a.position?.x ?? 0) - (b.position?.x ?? 0);
      }
      return (a.position?.y ?? 0) - (b.position?.y ?? 0);
    });

  const queue =
    zeroInDegreeRoots.length > 0
      ? zeroInDegreeRoots.map((n) => n.id)
      : [targetTaskNode.id];
  const order = [];
  const visited = new Set();

  while (queue.length > 0) {
    const currId = queue.shift();
    if (visited.has(currId)) continue;
    visited.add(currId);

    const node = taskNodeMap.get(currId);
    if (node) order.push(node);

    const neighbors = (adj.get(currId) || []).slice().sort((a, b) => {
      const nodeA = taskNodeMap.get(a);
      const nodeB = taskNodeMap.get(b);
      // Sort by x first, then by y (top to bottom)
      if ((nodeA?.position?.x ?? 0) !== (nodeB?.position?.x ?? 0)) {
        return (nodeA?.position?.x ?? 0) - (nodeB?.position?.x ?? 0);
      }
      return (nodeA?.position?.y ?? 0) - (nodeB?.position?.y ?? 0);
    });

    for (const nxt of neighbors) {
      inDegree.set(nxt, inDegree.get(nxt) - 1);
      if (inDegree.get(nxt) <= 0 && !visited.has(nxt)) {
        queue.push(nxt);
      }
    }
  }

  // Any remaining task nodes that were not reached by strictly directed BFS
  const remainingNodes = taskNodes.filter((n) => !visited.has(n.id));
  remainingNodes.sort((a, b) => {
    if ((a.position?.x ?? 0) !== (b.position?.x ?? 0)) {
      return (a.position?.x ?? 0) - (b.position?.x ?? 0);
    }
    return (a.position?.y ?? 0) - (b.position?.y ?? 0);
  });

  for (const n of remainingNodes) {
    order.push(n);
    visited.add(n.id);
  }

  return order;
};

export class WorkflowExecutionEngine {
  // In-memory registry to control pause, resume, and cancellation per execution
  static activeControls = new Map();

  static buildExecutionOrder(nodes = [], edges = [], startNodeId = null) {
    return buildExecutionOrder(nodes, edges, startNodeId);
  }

  static getWorkflowSubgraph(nodes = [], edges = [], startNodeId = null) {
    return getWorkflowSubgraph(nodes, edges, startNodeId);
  }

  static getAllWorkflowSubgraphs(nodes = [], edges = []) {
    return getAllWorkflowSubgraphs(nodes, edges);
  }

  static detectCycles(edges = []) {
    const adj = new Map();
    for (const edge of edges) {
      if (!adj.has(edge.source)) adj.set(edge.source, []);
      adj.get(edge.source).push(edge.target);
    }
    const visited = new Set();
    const recStack = new Set();

    const dfs = (node) => {
      visited.add(node);
      recStack.add(node);
      const neighbors = adj.get(node) || [];
      for (const n of neighbors) {
        if (!visited.has(n)) {
          if (dfs(n)) return true;
        } else if (recStack.has(n)) {
          return true;
        }
      }
      recStack.delete(node);
      return false;
    };

    for (const node of adj.keys()) {
      if (!visited.has(node)) {
        if (dfs(node)) return true;
      }
    }
    return false;
  }

  /**
   * Pause a running workflow
   */
  static pause(executionId) {
    const ctrl = this.activeControls.get(executionId);
    if (ctrl) {
      ctrl.isPaused = true;
      return true;
    }
    return false;
  }

  /**
   * Resume a paused workflow
   */
  static resume(executionId) {
    const ctrl = this.activeControls.get(executionId);
    if (ctrl) {
      ctrl.isPaused = false;
      if (typeof ctrl.resumeResolver === "function") {
        const resolve = ctrl.resumeResolver;
        ctrl.resumeResolver = null;
        resolve();
      }
      return true;
    }
    return false;
  }

  /**
   * Cancel a running or paused workflow
   */
  static cancel(executionId) {
    const ctrl = this.activeControls.get(executionId);
    if (ctrl) {
      ctrl.isCancelled = true;
      if (typeof ctrl.resumeResolver === "function") {
        ctrl.resumeResolver();
      }
      return true;
    }
    return false;
  }

  /**
   * Execute instruction using the actual AI Agent Orchestrator with strict validation.
   */
  static async executeWithAiAgent({
    instruction,
    node,
    previousNodeOutput,
    sharedWorkflowContext = {},
    workflowId = null,
    userId,
    executionId,
    onProgress,
  }) {
    if (!instruction || !instruction.trim()) {
      throw new Error(`Node "${node?.label || node?.id || "Custom Task"}" has no saved task instruction.`);
    }

    return await AiAgentOrchestrator.executeNodeTask({
      instruction,
      node,
      previousNodeOutput,
      sharedWorkflowContext,
      workflowId,
      userId,
      executionId,
      onProgress,
    });
  }

  /**
   * Execute an automation workflow for a user.
   */
  static async run({
    automationId = null,
    userId,
    triggerType = "manual",
    rerunExecutionId = null,
    startNodeId = null,
    workflowNodeIds = null,
    scheduledOccurrenceKey = null,
    scheduledDate = null,
    timezone = null,
  }) {
    let automation;
    if (automationId) {
      automation = await AiAutomation.findOne({ _id: automationId, userId });
    } else {
      automation = await AiAutomation.findOne({ userId });
    }

    if (!automation) {
      throw new Error("Automation workflow not found for user.");
    }

    let nodes = automation.nodes || [];
    let edges = automation.edges || [];

    if (!nodes.length) {
      throw new Error("No nodes configured in this automation workflow.");
    }

    // If specific workflowNodeIds are provided, strictly isolate nodes and edges to ONLY this workflow
    if (Array.isArray(workflowNodeIds) && workflowNodeIds.length > 0) {
      const allowedNodeIds = new Set(workflowNodeIds);
      nodes = nodes.filter((n) => allowedNodeIds.has(n.id));
      edges = edges.filter((e) => allowedNodeIds.has(e.source) && allowedNodeIds.has(e.target));
    }

    // Isolate the specific workflow connected to startNodeId (prevents other workflows on the canvas from running)
    const workflow = getWorkflowSubgraph(nodes, edges, startNodeId);
    const rootNodeId = workflow.rootTaskNode?.id || workflow.rootNode?.id || startNodeId || null;

    // Guard: Prevent duplicate scheduled occurrence execution
    if (scheduledOccurrenceKey) {
      const existingScheduled = await AutomationExecution.findOne({
        automationId: automation._id,
        scheduledOccurrenceKey,
      });
      if (existingScheduled) {
        return {
          executionId: existingScheduled.executionId,
          execution: existingScheduled,
          duplicatePrevented: true,
          completionPromise: Promise.resolve(existingScheduled),
        };
      }
    }

    // Guard: Prevent multiple simultaneous runs of the exact same workflow component
    const runningQuery = {
      userId,
      automationId: automation._id,
      status: "running",
    };
    if (rootNodeId) {
      runningQuery.rootNodeId = rootNodeId;
    }
    const existingRunning = await AutomationExecution.findOne(runningQuery);

    if (existingRunning && !rerunExecutionId) {
      // Check if it is actually alive in memory
      const isAlive = WorkflowExecutionEngine.activeControls.has(existingRunning.executionId);
      if (isAlive) {
        return {
          executionId: existingRunning.executionId,
          execution: existingRunning,
          completionPromise: Promise.resolve(existingRunning),
        };
      } else {
        // Orphaned running state from server restart or crash, clean it up
        existingRunning.status = "failed";
        existingRunning.errorSummary = "Interrupted by previous process termination.";
        await existingRunning.save().catch(() => {});
      }
    }

    // Determine execution order for ONLY this workflow component
    const orderedNodes = buildExecutionOrder(workflow.nodes, workflow.edges, startNodeId);
    if (!orderedNodes.length) {
      throw new Error("No executable nodes found in this workflow.");
    }

    const executionId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const workflowName = workflow.workflowName || automation.name || "AI Automation Workflow";

    // Include completed prelude nodes (Action, Date, Time) that were validated prior to Start node execution
    const preludeNodes = workflow.nodes.filter(
      (n) => (n.type === "action" || n.type === "date" || n.type === "time") && !orderedNodes.some((o) => o.id === n.id)
    );

    const preludeNodeExecutions = preludeNodes.map((node, index) => ({
      nodeId: node.id,
      nodeName: node.label || `${node.type.toUpperCase()} Node`,
      nodeType: node.type,
      status: "completed",
      executionOrder: index + 1,
      attemptNumber: 1,
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 0,
      input: { task: node.text || node.label || node.type, config: node.config || {} },
      output: { status: "success", validated: true },
      error: null,
      retryInfo: null,
    }));

    const dateNode = workflow.nodes.find((n) => n.type === "date") || null;
    const timeNode = workflow.nodes.find((n) => n.type === "time") || null;
    const effectiveTimezone =
      timezone ||
      timeNode?.config?.timezone ||
      dateNode?.config?.timezone ||
      "Asia/Kolkata";

    const sharedContext = {
      executionId,
      workflowId: String(automation._id),
      triggerType,
      scheduledOccurrenceKey: scheduledOccurrenceKey || null,
      scheduledDate: scheduledDate || null,
      timezone: effectiveTimezone,
      dateConfig: dateNode?.config || null,
      timeConfig: timeNode?.config || null,
      nodeResults: {},
    };

    const extractCompleteNodeInstruction = (n) => {
      const candidates = [
        n?.text,
        n?.config?.instruction,
        n?.config?.task,
        n?.config?.aiPrompt,
        n?.config?.message,
        n?.data?.instruction,
        n?.data?.text,
        n?.taskDescription,
      ];
      for (const c of candidates) {
        if (typeof c === "string" && c.trim().length > 0) {
          return c.trim();
        }
      }
      return typeof n?.label === "string" ? n.label.trim() : "";
    };

    const taskNodeExecutions = orderedNodes.map((node, index) => {
      const origInst = extractCompleteNodeInstruction(node);
      return {
        nodeId: node.id,
        nodeName: node.label || `${node.type.toUpperCase()} Node`,
        nodeType: node.type,
        status: "pending",
        executionOrder: preludeNodeExecutions.length + index + 1,
        attemptNumber: 1,
        startedAt: null,
        completedAt: null,
        durationMs: 0,
        originalInstruction: origInst,
        executionSummary: null,
        dataProcessing: null,
        structuredData: null,
        input: { task: origInst || node.label || node.type, config: node.config || {} },
        output: null,
        error: null,
        retryInfo: rerunExecutionId ? { rerunFrom: rerunExecutionId } : null,
      };
    });

    const initialNodeExecutions = [...preludeNodeExecutions, ...taskNodeExecutions];

    const initialLogs = [
      {
        timestamp: new Date(),
        level: "info",
        nodeId: null,
        nodeName: null,
        message: `Workflow "${workflowName}" run started [Run ID: ${executionId}, Trigger: ${triggerType}${
          scheduledDate ? `, Scheduled Date: ${scheduledDate}` : ""
        }]`,
      },
    ];

    const execution = await AutomationExecution.create({
      executionId,
      automationId: automation._id,
      automationName: workflowName,
      workflowName,
      rootNodeId,
      userId,
      triggerType,
      scheduledOccurrenceKey: scheduledOccurrenceKey || null,
      scheduledDate: scheduledDate || null,
      sharedContext,
      status: "running",
      startedAt: new Date(),
      totalNodes: initialNodeExecutions.length,
      successfulNodes: preludeNodeExecutions.length,
      failedNodes: 0,
      skippedNodes: 0,
      nodes: initialNodeExecutions,
      logs: initialLogs,
    });

    // Mutex queue to serialize all execution.save() operations and completely eliminate Mongoose ParallelSaveError
    let saveQueue = Promise.resolve();
    const safeSaveExecution = () => {
      saveQueue = saveQueue
        .catch(() => {})
        .then(async () => {
          let attempts = 4;
          while (attempts > 0) {
            try {
              await execution.save();
              return;
            } catch (err) {
              if (err.name === "ParallelSaveError") {
                if (attempts > 1) {
                  attempts--;
                  await new Promise((r) => setTimeout(r, 150));
                  continue;
                }
                // Resilient fallback: Persist updates atomically via updateOne to prevent parallel save crash
                try {
                  const AutomationExecution = (await import("../../models/automationExecutionModel.js")).default;
                  await AutomationExecution.updateOne(
                    { _id: execution._id },
                    {
                      $set: {
                        status: execution.status,
                        nodes: execution.nodes,
                        logs: execution.logs,
                        successfulNodes: execution.successfulNodes,
                        failedNodes: execution.failedNodes,
                        totalNodes: execution.totalNodes,
                        completedAt: execution.completedAt,
                        errorSummary: execution.errorSummary,
                      },
                    }
                  );
                } catch (_) {}
                return;
              }
              throw err;
            }
          }
        });
      return saveQueue;
    };

    // Register active control for pause / cancel / resume
    const control = { isPaused: false, isCancelled: false, resumeResolver: null };
    WorkflowExecutionEngine.activeControls.set(executionId, control);

    // Helper to emit live websocket updates
    const emitLiveUpdate = (eventType, payload) => {
      try {
        const io = getIo();
        if (io) {
          io.to(`user:${userId.toString()}`).emit("automation:execution_update", {
            event: eventType,
            executionId,
            rootNodeId,
            
            startNodeId,
            workflowName,
            ...payload,
          });
        }
      } catch (err) {
        console.warn("[WorkflowEngine Socket Warning]:", err.message);
      }
    };

    emitLiveUpdate("started", {
      execution: execution.toObject(),
    });

    // Execute sequentially node-by-node, strictly awaiting tool execution and completion validation
    const executePromise = (async () => {
      let successfulCount = 0;
      let failedCount = 0;
      let skippedCount = 0;
      let waitingForInputCount = 0;
      let previousNodeOutput = null;
      let workflowHalted = false;
      const completedNodeOutputs = new Map();

      const buildUpstreamContextForNode = (targetNode) => {
        const incomingParentIds = new Set(
          (workflow.edges || [])
            .filter((e) => e.target === targetNode.id)
            .map((e) => e.source)
        );

        const directParents = [];
        const allCompleted = [];
        for (const [cId, cEntry] of completedNodeOutputs.entries()) {
          allCompleted.push(cEntry);
          if (incomingParentIds.has(cId)) {
            directParents.push(cEntry);
          }
        }

        // Prefer direct connected upstream parents when present; also include transitive upstream context
        const previousNodeResults =
          directParents.length > 0
            ? [
                ...allCompleted.filter((e) => !incomingParentIds.has(e.nodeId)),
                ...directParents,
              ]
            : allCompleted;

        return {
          ...sharedContext,
          previousNodeResults,
        };
      };

      try {
        for (let i = 0; i < orderedNodes.length; i++) {
          const node = orderedNodes[i];
          const nodeIndex = execution.nodes.findIndex((n) => n.nodeId === node.id);
          if (nodeIndex === -1) continue;

          // Reload latest saved node instruction from MongoDB so edits are never stale or truncated
          let freshNode = node;
          try {
            const latestAuto = await AiAutomation.findById(automation._id).select("nodes").lean();
            const dbNode = (latestAuto?.nodes || []).find((n) => n.id === node.id);
            if (dbNode) {
              freshNode = { ...node, ...dbNode };
            }
          } catch (_) {}

          // Check if execution was cancelled
          if (control.isCancelled) {
            execution.nodes[nodeIndex].status = "cancelled";
            continue;
          }

          // Check if execution is paused
          if (control.isPaused) {
            execution.status = "paused";
            execution.nodes[nodeIndex].status = "paused";
            execution.logs.push({
              timestamp: new Date(),
              level: "warn",
              nodeId: freshNode.id,
              nodeName: freshNode.label,
              message: `Workflow execution paused at node "${freshNode.label || freshNode.type}"`,
            });
            await safeSaveExecution();

            emitLiveUpdate("paused", {
              nodeId: freshNode.id,
              nodeIndex,
              execution: execution.toObject(),
            });

            await new Promise((resolve) => {
              control.resumeResolver = resolve;
            });

            if (control.isCancelled) {
              execution.nodes[nodeIndex].status = "cancelled";
              continue;
            }

            execution.status = "running";
            execution.logs.push({
              timestamp: new Date(),
              level: "info",
              nodeId: freshNode.id,
              nodeName: freshNode.label,
              message: `Workflow execution resumed from node "${freshNode.label || freshNode.type}"`,
            });
            await safeSaveExecution();

            emitLiveUpdate("resumed", {
              nodeId: freshNode.id,
              nodeIndex,
              execution: execution.toObject(),
            });
          }

          if (workflowHalted) {
            execution.nodes[nodeIndex].status = "skipped";
            skippedCount++;
            execution.skippedNodes = skippedCount;
            continue;
          }

          const nodeStartTime = Date.now();
          const completeInstruction = extractCompleteNodeInstruction(freshNode);
          execution.nodes[nodeIndex].status = "running";
          execution.nodes[nodeIndex].startedAt = new Date(nodeStartTime);
          execution.nodes[nodeIndex].originalInstruction = completeInstruction;

          execution.logs.push({
            timestamp: new Date(),
            level: "info",
            nodeId: freshNode.id,
            nodeName: freshNode.label || freshNode.type,
            message: `Node ${i + 1}/${orderedNodes.length} "${freshNode.label || freshNode.type}" started execution`,
          });

          await safeSaveExecution();
          emitLiveUpdate("node_started", {
            nodeId: freshNode.id,
            nodeIndex,
            node: execution.nodes[nodeIndex].toObject(),
          });

          try {
            let resolvedInput = null;
            let resolvedOutput = null;

            const handleProgress = async (prog) => {
              if (prog.state === "verifying") {
                execution.nodes[nodeIndex].status = "verifying";
                execution.markModified("nodes");
                await safeSaveExecution().catch(() => {});
                emitLiveUpdate("node_verifying", {
                  nodeId: freshNode.id,
                  nodeIndex,
                  node: execution.nodes[nodeIndex].toObject(),
                });
              }
            };

            const nodeSharedContext = buildUpstreamContextForNode(freshNode);

            switch (freshNode.type) {
              case "trigger": {
                const isBoilerplateTrigger =
                  !completeInstruction ||
                  ["start workflow", "trigger node", "trigger", "start", "schedule trigger", "manual trigger"].includes(
                    completeInstruction.toLowerCase()
                  );

                if (!isBoilerplateTrigger) {
                  resolvedInput = {
                    task: completeInstruction,
                    config: freshNode.config || {},
                    triggerMode: freshNode.config?.triggerMode || triggerType,
                    upstreamNodesCount: nodeSharedContext.previousNodeResults.length,
                  };

                  resolvedOutput = await WorkflowExecutionEngine.executeWithAiAgent({
                    instruction: completeInstruction,
                    node: freshNode,
                    previousNodeOutput,
                    sharedWorkflowContext: nodeSharedContext,
                    workflowId: String(automation._id),
                    userId,
                    executionId,
                    onProgress: handleProgress,
                  });
                } else {
                  resolvedInput = {
                    triggerMode: freshNode.config?.triggerMode || triggerType,
                    configuredSchedule: freshNode.config?.schedule || "Automated Schedule",
                    timestamp: new Date().toISOString(),
                  };
                  resolvedOutput = {
                    status: "completed",
                    result: `Trigger activated via ${triggerType}`,
                    executionSummary: {
                      understoodObjective: `Trigger workflow execution (${triggerType})`,
                      executionPlan: ["Activate workflow trigger and advance to first connected task node."],
                      integrationsInvolved: ["Workflow Scheduler"],
                    },
                    toolCalls: [],
                    dataProcessing: {
                      dataFetched: "None",
                      fieldMappings: [],
                      recordsProcessed: 0,
                      recordsInserted: 0,
                      recordsUpdated: 0,
                    },
                    output: {
                      status: "success",
                      triggeredAt: new Date().toISOString(),
                      triggerMode: freshNode.config?.triggerMode || triggerType,
                      message: `Trigger activated via ${triggerType}`,
                    },
                    validation: { verified: true, verificationStatus: "VERIFIED", reason: "Trigger activated." },
                  };
                }
                break;
              }

              case "date": {
                resolvedInput = {
                  dateMode: freshNode.config?.dateType || freshNode.config?.dateMode || "specific",
                  specificDate: freshNode.config?.specificDate || null,
                  recurringPattern: freshNode.config?.recurrencePattern || freshNode.config?.recurringPattern || "every_day",
                  timezone: freshNode.config?.timezone || effectiveTimezone,
                };
                resolvedOutput = {
                  status: "completed",
                  result: `Date configuration validated (${resolvedInput.timezone})`,
                  output: {
                    status: "success",
                    dateValidated: true,
                    timezone: resolvedInput.timezone,
                    pattern: resolvedInput.recurringPattern,
                  },
                  validation: { verified: true, verificationStatus: "VERIFIED" },
                };
                break;
              }

              case "time": {
                resolvedInput = {
                  time: freshNode.config?.time || "00:00",
                  ampm: freshNode.config?.ampm || "AM",
                  timezone: freshNode.config?.timezone || effectiveTimezone,
                  recurrence: freshNode.config?.recurrence || "daily",
                };
                resolvedOutput = {
                  status: "completed",
                  result: `Schedule time validated (${resolvedInput.time} ${resolvedInput.timezone})`,
                  output: {
                    status: "success",
                    timeWindowActive: true,
                    formattedTime: `${resolvedInput.time} ${resolvedInput.ampm || ""}`.trim(),
                    timezone: resolvedInput.timezone,
                  },
                  validation: { verified: true, verificationStatus: "VERIFIED" },
                };
                break;
              }

              case "action": {
                const actionType = freshNode.config?.actionType || "send_notification";
                const isAiTask =
                  actionType === "ai_agent_task" ||
                  actionType === "generate_report" ||
                  actionType === "sync_meta_ads_to_sheet" ||
                  (completeInstruction &&
                    !["scheduled automation triggered", "action node", "action"].includes(
                      completeInstruction.toLowerCase()
                    ));

                if (isAiTask) {
                  resolvedInput = {
                    actionType,
                    task: completeInstruction,
                    config: freshNode.config || {},
                    upstreamNodesCount: nodeSharedContext.previousNodeResults.length,
                  };

                  resolvedOutput = await WorkflowExecutionEngine.executeWithAiAgent({
                    instruction: completeInstruction,
                    node: freshNode,
                    previousNodeOutput,
                    sharedWorkflowContext: nodeSharedContext,
                    workflowId: String(automation._id),
                    userId,
                    executionId,
                    onProgress: handleProgress,
                  });
                } else {
                  resolvedInput = {
                    actionType,
                    message: completeInstruction || "Scheduled Automation Triggered",
                    priority: freshNode.config?.priority || "Medium",
                  };

                  const actionResult = await ActionExecutor.execute(freshNode, userId, triggerType);
                  if (actionResult.status === "failed") {
                    throw new Error(actionResult.error || "Action execution failed");
                  }
                  resolvedOutput = {
                    status: "completed",
                    result: actionResult.message || JSON.stringify(actionResult.result),
                    output: actionResult.result || { message: actionResult.message },
                    validation: { verified: true, verificationStatus: "VERIFIED" },
                  };
                }
                break;
              }

              case "generic":
              default: {
                if (!completeInstruction) {
                  throw new Error(`Custom Task node "${freshNode.label || freshNode.id}" has no saved instruction.`);
                }

                resolvedInput = {
                  task: completeInstruction,
                  config: freshNode.config || {},
                  upstreamNodesCount: nodeSharedContext.previousNodeResults.length,
                  upstreamNodeIds: nodeSharedContext.previousNodeResults.map((p) => p.nodeId),
                };

                resolvedOutput = await WorkflowExecutionEngine.executeWithAiAgent({
                  instruction: completeInstruction,
                  node: freshNode,
                  previousNodeOutput,
                  sharedWorkflowContext: nodeSharedContext,
                  workflowId: String(automation._id),
                  userId,
                  executionId,
                  onProgress: handleProgress,
                });
                break;
              }
            }

            const nodeDuration = Date.now() - nodeStartTime;
            const isWaitingForInput =
              resolvedOutput?.status === "waiting_for_input" ||
              resolvedOutput?.agentStatus === "WAITING_FOR_INPUT";

            if (isWaitingForInput) {
              execution.nodes[nodeIndex].status = "waiting_for_input";
              execution.nodes[nodeIndex].completedAt = new Date();
              execution.nodes[nodeIndex].durationMs = nodeDuration;
              execution.nodes[nodeIndex].input = sanitizePayload(resolvedInput);
              execution.nodes[nodeIndex].executionSummary = sanitizePayload(resolvedOutput?.executionSummary || null);
              execution.nodes[nodeIndex].dataProcessing = sanitizePayload(resolvedOutput?.dataProcessing || null);
              execution.nodes[nodeIndex].output = sanitizePayload({
                status: "waiting_for_input",
                clarificationQuestion: resolvedOutput?.response || resolvedOutput?.result,
                response: resolvedOutput?.response || resolvedOutput?.result,
              });
              execution.nodes[nodeIndex].toolsCalled = sanitizePayload(resolvedOutput?.toolCalls || []);
              execution.nodes[nodeIndex].validation = sanitizePayload(resolvedOutput?.validation || null);
              execution.markModified("nodes");

              waitingForInputCount++;
              workflowHalted = true;
              execution.errorSummary = resolvedOutput?.response || "Waiting for required user input.";

              execution.logs.push({
                timestamp: new Date(),
                level: "warn",
                nodeId: freshNode.id,
                nodeName: freshNode.label || freshNode.type,
                message: `Node "${freshNode.label || freshNode.type}" requires user input: ${resolvedOutput?.response}`,
              });

              // Mark remaining downstream nodes as skipped
              for (let j = i + 1; j < orderedNodes.length; j++) {
                const remNode = orderedNodes[j];
                const remIdx = execution.nodes.findIndex((n) => n.nodeId === remNode.id);
                if (remIdx !== -1 && execution.nodes[remIdx].status === "pending") {
                  execution.nodes[remIdx].status = "skipped";
                  skippedCount++;
                  execution.skippedNodes = skippedCount;
                  emitLiveUpdate("node_skipped", {
                    nodeId: remNode.id,
                    nodeIndex: remIdx,
                    node: execution.nodes[remIdx].toObject(),
                    reason: "Upstream node is waiting for user input.",
                  });
                }
              }

              await safeSaveExecution();
              emitLiveUpdate("node_waiting_for_input", {
                nodeId: freshNode.id,
                nodeIndex,
                node: execution.nodes[nodeIndex].toObject(),
              });
              break;
            }

            // Node completed and passed verification -> save complete structured result & advance
            const cleanTextOutput =
              typeof resolvedOutput === "string"
                ? resolvedOutput
                : resolvedOutput?.response ||
                  resolvedOutput?.result ||
                  resolvedOutput?.content ||
                  JSON.stringify(resolvedOutput?.output || resolvedOutput);

            execution.nodes[nodeIndex].status = "completed";
            execution.nodes[nodeIndex].completedAt = new Date();
            execution.nodes[nodeIndex].durationMs = nodeDuration;
            execution.nodes[nodeIndex].input = sanitizePayload(resolvedInput);
            execution.nodes[nodeIndex].executionSummary = sanitizePayload(resolvedOutput?.executionSummary || null);
            execution.nodes[nodeIndex].dataProcessing = sanitizePayload(resolvedOutput?.dataProcessing || null);
            execution.nodes[nodeIndex].structuredData = sanitizePayload(resolvedOutput?.structuredData || null);
            execution.nodes[nodeIndex].output = sanitizePayload({
              status: "completed",
              response: cleanTextOutput,
              result: cleanTextOutput,
              executionSummary: resolvedOutput?.executionSummary || null,
              dataProcessing: resolvedOutput?.dataProcessing || null,
              validation: resolvedOutput?.validation || null,
              ...(typeof resolvedOutput?.output === "object" ? resolvedOutput.output : {}),
            });
            execution.nodes[nodeIndex].toolsCalled = sanitizePayload(resolvedOutput?.toolCalls || []);
            execution.nodes[nodeIndex].validation = sanitizePayload(resolvedOutput?.validation || null);
            execution.markModified("nodes");

            const isPlainTrigger =
              freshNode.type === "trigger" &&
              (!completeInstruction ||
                ["start workflow", "trigger node", "trigger", "start", "schedule trigger", "manual trigger"].includes(
                  completeInstruction.toLowerCase()
                ));

            if (!isPlainTrigger) {
              previousNodeOutput = cleanTextOutput;
              const sharedNodeEntry = {
                nodeId: freshNode.id,
                nodeLabel: freshNode.label || freshNode.type,
                status: "completed",
                originalInstruction: completeInstruction,
                outputText: cleanTextOutput,
                structuredData: resolvedOutput?.structuredData || {},
                executionSummary: resolvedOutput?.executionSummary || null,
                dataProcessing: resolvedOutput?.dataProcessing || null,
              };
              completedNodeOutputs.set(freshNode.id, sharedNodeEntry);
              sharedContext.nodeResults[freshNode.id] = {
                status: "SUCCESS",
                output: cleanTextOutput,
                structuredData: sanitizePayload(resolvedOutput?.structuredData || {}),
              };
              execution.sharedContext = sanitizePayload(sharedContext);
              execution.markModified("sharedContext");
            }

            successfulCount++;
            execution.successfulNodes = preludeNodeExecutions.length + successfulCount;

            execution.logs.push({
              timestamp: new Date(),
              level: "success",
              nodeId: freshNode.id,
              nodeName: freshNode.label || freshNode.type,
              message: `Node "${freshNode.label || freshNode.type}" verified and completed in ${(
                nodeDuration / 1000
              ).toFixed(2)}s (${(resolvedOutput?.toolCalls || []).length} tool call(s))`,
            });

            await safeSaveExecution();
            emitLiveUpdate("node_completed", {
              nodeId: freshNode.id,
              nodeIndex,
              node: execution.nodes[nodeIndex].toObject(),
            });
          } catch (nodeErr) {
            const nodeDuration = Date.now() - nodeStartTime;
            execution.nodes[nodeIndex].status = "failed";
            execution.nodes[nodeIndex].completedAt = new Date();
            execution.nodes[nodeIndex].durationMs = nodeDuration;
            execution.nodes[nodeIndex].error = {
              message: nodeErr.message || "Execution error",
              code: nodeErr.code || "ERR_NODE_EXECUTION",
            };
            execution.nodes[nodeIndex].toolsCalled = sanitizePayload(nodeErr.toolCalls || []);
            execution.nodes[nodeIndex].validation = sanitizePayload(nodeErr.validation || null);
            execution.markModified("nodes");

            failedCount++;
            execution.failedNodes = failedCount;
            workflowHalted = true;

            execution.logs.push({
              timestamp: new Date(),
              level: "error",
              nodeId: freshNode.id,
              nodeName: freshNode.label || freshNode.type,
              message: `Node "${freshNode.label || freshNode.type}" failed: ${nodeErr.message}`,
            });

            await safeSaveExecution();
            emitLiveUpdate("node_failed", {
              nodeId: freshNode.id,
              nodeIndex,
              node: execution.nodes[nodeIndex].toObject(),
              error: nodeErr.message,
            });

            // Strict sequential failure gate: mark all downstream dependent nodes as SKIPPED ("skipped")
            // while preserving all completed upstream node results.
            for (let j = i + 1; j < orderedNodes.length; j++) {
              const remNode = orderedNodes[j];
              const remIdx = execution.nodes.findIndex((n) => n.nodeId === remNode.id);
              if (remIdx !== -1 && execution.nodes[remIdx].status === "pending") {
                execution.nodes[remIdx].status = "skipped";
                execution.nodes[remIdx].error = {
                  message: `Skipped because upstream node "${freshNode.label || freshNode.type}" failed: ${nodeErr.message}`,
                  code: "ERR_UPSTREAM_FAILED",
                };
                skippedCount++;
                execution.skippedNodes = skippedCount;
                execution.logs.push({
                  timestamp: new Date(),
                  level: "warn",
                  nodeId: remNode.id,
                  nodeName: remNode.label || remNode.type,
                  message: `Node "${remNode.label || remNode.type}" marked SKIPPED due to upstream failure.`,
                });
                emitLiveUpdate("node_skipped", {
                  nodeId: remNode.id,
                  nodeIndex: remIdx,
                  node: execution.nodes[remIdx].toObject(),
                  reason: nodeErr.message,
                });
              }
            }
            execution.markModified("nodes");
            await safeSaveExecution();
            break;
          }
        }

        // Finish execution summary
        const totalDuration = Date.now() - execution.startedAt.getTime();
        execution.completedAt = new Date();
        execution.durationMs = totalDuration;

        if (control.isCancelled) {
          execution.status = "cancelled";
        } else if (waitingForInputCount > 0) {
          execution.status = "waiting_for_input";
        } else if (failedCount === 0) {
          execution.status = "completed";
        } else {
          execution.status = "failed";
          execution.errorSummary = execution.errorSummary || `${failedCount} node(s) failed; ${skippedCount} downstream node(s) skipped.`;
        }

        execution.logs.push({
          timestamp: new Date(),
          level: execution.status === "completed" ? "success" : execution.status === "waiting_for_input" ? "warn" : "error",
          nodeId: null,
          nodeName: null,
          message: `Workflow execution finished with status: ${execution.status} in ${(
            totalDuration / 1000
          ).toFixed(2)}s`,
        });

        await safeSaveExecution();

        // Update AiAutomation document with last run info using atomic update
        try {
          await AiAutomation.updateOne(
            { _id: automation._id },
            {
              $set: { lastRunAt: new Date() },
              $push: {
                executionHistory: {
                  $each: [
                    {
                      id: executionId,
                      executedAt: new Date(),
                      triggerType,
                      actionType: orderedNodes.find((n) => n.type === "action")?.config?.actionType || "workflow_execution",
                      status: execution.status === "completed" ? "success" : "failed",
                      message: `Executed ${successfulCount}/${orderedNodes.length} nodes successfully`,
                      result: { runId: executionId, totalNodes: orderedNodes.length, successfulNodes: successfulCount },
                      error: execution.errorSummary,
                      durationMs: totalDuration,
                    },
                  ],
                  $position: 0,
                  $slice: 50,
                },
              },
            }
          );
        } catch (saveErr) {
          console.warn("[WorkflowEngine AiAutomation update warn]:", saveErr.message);
        }

        emitLiveUpdate("completed", {
          execution: execution.toObject(),
        });

        return execution;
      } finally {
        WorkflowExecutionEngine.activeControls.delete(executionId);
      }
    })();

    return {
      executionId,
      execution,
      completionPromise: executePromise,
    };
  }

  /**
   * Retry execution from a specific failed node
   */
  static async retryNode({ executionId, nodeId, userId }) {
    const execution = await AutomationExecution.findOne({ executionId, userId });
    if (!execution) throw new Error("Execution record not found.");

    const nodeIndex = execution.nodes.findIndex((n) => n.nodeId === nodeId);
    if (nodeIndex === -1) throw new Error(`Node ${nodeId} not found in execution record.`);

    // Reset status of the target node and all subsequent nodes to pending
    for (let i = nodeIndex; i < execution.nodes.length; i++) {
      execution.nodes[i].status = "pending";
      execution.nodes[i].error = null;
      execution.nodes[i].startedAt = null;
      execution.nodes[i].completedAt = null;
    }

    execution.status = "running";
    execution.completedAt = null;
    execution.errorSummary = null;
    execution.failedNodes = 0;

    await execution.save();

    // Trigger re-execution of remaining nodes using run()
    return this.run({
      automationId: execution.automationId,
      userId,
      triggerType: "manual",
      rerunExecutionId: executionId,
    });
  }
}

export default WorkflowExecutionEngine;
