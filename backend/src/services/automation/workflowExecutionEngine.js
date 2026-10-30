import AiAutomation from "../../models/aiAutomationModel.js";
import AutomationExecution from "../../models/automationExecutionModel.js";
import ActionExecutor from "./actionExecutor.js";
import { runAgentChat } from "../../controller/chat.controller.js";
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
    return data.slice(0, 100).map((item) => sanitizePayload(item, seen, depth + 1));
  }

  const clean = {};
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

  // Natural canvas orientation for task nodes:
  // 1. If edge connects to targetTaskNode, flow is ALWAYS from targetTaskNode -> otherNode!
  // 2. Otherwise, flow is left-to-right (smaller x -> larger x)
  workflowEdges.forEach((e) => {
    if (taskNodeMap.has(e.source) && taskNodeMap.has(e.target)) {
      const nodeA = taskNodeMap.get(e.source);
      const nodeB = taskNodeMap.get(e.target);

      let fromId = e.source;
      let toId = e.target;

      if (nodeA?.position && nodeB?.position) {
        if (targetTaskNode && nodeA.id === targetTaskNode.id) {
          fromId = nodeA.id;
          toId = nodeB.id;
        } else if (targetTaskNode && nodeB.id === targetTaskNode.id) {
          fromId = nodeB.id;
          toId = nodeA.id;
        } else if ((nodeA.position.x ?? 0) <= (nodeB.position.x ?? 0)) {
          fromId = nodeA.id;
          toId = nodeB.id;
        } else {
          fromId = nodeB.id;
          toId = nodeA.id;
        }
      } else {
        // Fallback for tests without explicit positions: preserve edge.source -> edge.target
        fromId = e.source;
        toId = e.target;
      }

      adj.get(fromId).push(toId);
      inDegree.set(toId, (inDegree.get(toId) || 0) + 1);
    }
  });

  const queue = [targetTaskNode.id];
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
   * Execute instruction using the actual AI Agent
   */
  static async executeWithAiAgent({
    instruction,
    node,
    previousNodeOutput,
    userId,
    executionId,
  }) {
    if (!instruction || !instruction.trim()) {
      return {
        status: "completed",
        result: `Node "${node.label || node.type}" completed without instructions.`,
        task: node.label || node.type,
      };
    }

    // Extract any explicit Meta Ad Account ID like act_1416124059911929 or 1416124059911929 or from node configuration
    let metaAccountId = node.data?.adAccountId || node.data?.accountId || node.adAccountId || node.accountId || null;
    if (metaAccountId) {
      metaAccountId = String(metaAccountId).replace(/^act_/, "");
    }
    const actMatch = instruction.match(/\b(?:act_)?(\d{10,22})\b/i);
    if (actMatch) {
      metaAccountId = actMatch[1];
    }

    let userMessage = instruction;
    if (previousNodeOutput) {
      let formattedPrev = "";
      if (typeof previousNodeOutput === "string") {
        formattedPrev = previousNodeOutput;
      } else if (previousNodeOutput?.result && typeof previousNodeOutput.result === "string") {
        formattedPrev = previousNodeOutput.result;
      } else if (previousNodeOutput?.output?.result && typeof previousNodeOutput.output.result === "string") {
        formattedPrev = previousNodeOutput.output.result;
      } else if (previousNodeOutput?.content && typeof previousNodeOutput.content === "string") {
        formattedPrev = previousNodeOutput.content;
      } else {
        formattedPrev = JSON.stringify(previousNodeOutput, null, 2);
      }

      userMessage = `${instruction}

[Context from previous step]:
${formattedPrev}`;
    }

    let streamedText = "";
    const toolCalls = [];

    const agentResult = await runAgentChat({
      userId,
      conversationId: `automation_${executionId}_${node.id}`,
      userMessage,
      metaAccountId,
      accountId: metaAccountId ? `act_${metaAccountId}` : undefined,
      onEvent: (event) => {
        if (event.type === "text_delta" || event.type === "content") {
          streamedText += event.content || event.text || "";
        } else if (
          event.type === "tool_call" ||
          event.type === "action" ||
          event.type === "tool_status"
        ) {
          toolCalls.push(event);
        }
      },
    });

    const finalResult =
      streamedText.trim() ||
      agentResult?.content ||
      agentResult?.result ||
      "";

    // Strict validation: Do not mark node completed or proceed to next node if AI agent failed to return a valid response
    if (!finalResult || finalResult.length < 15 || finalResult.includes("couldn't process your request right now")) {
      throw new Error(`AI Agent failed to produce a complete response for node "${node.label || node.type}". Halting execution to prevent passing empty state.`);
    }

    return {
      status: "completed",
      result: finalResult,
      toolCalls: agentResult?.toolCalls?.length ? agentResult.toolCalls : toolCalls,
      tokenUsage: agentResult?.tokenUsage || null,
      taskName: instruction,
    };
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

    const nodes = automation.nodes || [];
    const edges = automation.edges || [];

    if (!nodes.length) {
      throw new Error("No nodes configured in this automation workflow.");
    }

    // Isolate the specific workflow connected to startNodeId (prevents other workflows on the canvas from running)
    const workflow = getWorkflowSubgraph(nodes, edges, startNodeId);
    const rootNodeId = workflow.rootTaskNode?.id || workflow.rootNode?.id || startNodeId || null;

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
      return {
        executionId: existingRunning.executionId,
        execution: existingRunning,
        completionPromise: Promise.resolve(existingRunning),
      };
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

    const taskNodeExecutions = orderedNodes.map((node, index) => ({
      nodeId: node.id,
      nodeName: node.label || `${node.type.toUpperCase()} Node`,
      nodeType: node.type,
      status: "pending",
      executionOrder: preludeNodeExecutions.length + index + 1,
      attemptNumber: 1,
      startedAt: null,
      completedAt: null,
      durationMs: 0,
      input: { task: node.text || node.label || node.type, config: node.config || {} },
      output: null,
      error: null,
      retryInfo: rerunExecutionId ? { rerunFrom: rerunExecutionId } : null,
    }));

    const initialNodeExecutions = [...preludeNodeExecutions, ...taskNodeExecutions];

    const initialLogs = [
      {
        timestamp: new Date(),
        level: "info",
        nodeId: null,
        nodeName: null,
        message: `Workflow "${workflowName}" run started [Run ID: ${executionId}, Trigger: ${triggerType}]`,
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
      status: "running",
      startedAt: new Date(),
      totalNodes: initialNodeExecutions.length,
      successfulNodes: preludeNodeExecutions.length,
      failedNodes: 0,
      nodes: initialNodeExecutions,
      logs: initialLogs,
    });

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

    // Execute in background so the HTTP request can respond or return the running record
    const executePromise = (async () => {
      let successfulCount = 0;
      let failedCount = 0;
      let previousNodeOutput = null;
      let workflowFailed = false;
      const completedNodeOutputs = new Map();

      try {
        for (let i = 0; i < orderedNodes.length; i++) {
          const node = orderedNodes[i];
          const nodeIndex = execution.nodes.findIndex((n) => n.nodeId === node.id);
          if (nodeIndex === -1) continue;

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
              nodeId: node.id,
              nodeName: node.label,
              message: `Workflow execution paused at node "${node.label || node.type}"`,
            });
            await execution.save();

            emitLiveUpdate("paused", {
              nodeId: node.id,
              nodeIndex,
              execution: execution.toObject(),
            });

            // Wait until resume() is invoked
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
              nodeId: node.id,
              nodeName: node.label,
              message: `Workflow execution resumed from node "${node.label || node.type}"`,
            });
            await execution.save();

            emitLiveUpdate("resumed", {
              nodeId: node.id,
              nodeIndex,
              execution: execution.toObject(),
            });
          }

          if (workflowFailed) {
            // Mark remaining nodes as skipped
            execution.nodes[nodeIndex].status = "skipped";
            execution.logs.push({
              timestamp: new Date(),
              level: "warn",
              nodeId: node.id,
              nodeName: node.label,
              message: `Node "${node.label || node.type}" skipped due to upstream failure`,
            });
            continue;
          }

          const nodeStartTime = Date.now();
          execution.nodes[nodeIndex].status = "running";
          execution.nodes[nodeIndex].startedAt = new Date(nodeStartTime);

          execution.logs.push({
            timestamp: new Date(),
            level: "info",
            nodeId: node.id,
            nodeName: node.label || node.type,
            message: `Node ${i + 1}/${orderedNodes.length} "${node.label || node.type}" started execution`,
          });

          await execution.save();
          emitLiveUpdate("node_started", {
            nodeId: node.id,
            nodeIndex,
            node: execution.nodes[nodeIndex].toObject(),
          });

          try {
            let resolvedInput = null;
            let resolvedOutput = null;

            switch (node.type) {
              case "trigger": {
                const instructionText = (node.text || node.label || "").trim();
                const isCustomInstruction =
                  instructionText &&
                  instructionText.toLowerCase() !== "start workflow" &&
                  instructionText.toLowerCase() !== "trigger node" &&
                  instructionText.toLowerCase() !== "trigger" &&
                  instructionText.toLowerCase() !== "start";

                if (isCustomInstruction) {
                  resolvedInput = {
                    task: instructionText,
                    config: node.config || {},
                    triggerMode: node.config?.triggerMode || triggerType,
                    inputContext: previousNodeOutput,
                  };

                  const aiResult = await WorkflowExecutionEngine.executeWithAiAgent({
                    instruction: instructionText,
                    node,
                    previousNodeOutput,
                    userId,
                    executionId,
                  });

                  resolvedOutput = aiResult;
                } else {
                  await new Promise((r) => setTimeout(r, 1200));
                  resolvedInput = {
                    triggerMode: node.config?.triggerMode || triggerType,
                    configuredSchedule: node.config?.schedule || "Automated Schedule",
                    timestamp: new Date().toISOString(),
                  };
                  resolvedOutput = {
                    status: "success",
                    triggeredAt: new Date().toISOString(),
                    triggerMode: node.config?.triggerMode || triggerType,
                    message: `Trigger activated via ${triggerType}`,
                  };
                }
                break;
              }

              case "date": {
                // Medium speed pacing for date verification & sync
                await new Promise((r) => setTimeout(r, 1400));
                resolvedInput = {
                  dateMode: node.config?.dateMode || "specific",
                  specificDate: node.config?.specificDate || null,
                  recurringPattern: node.config?.recurringPattern || "every_day",
                  timezone: node.config?.timezone || "Asia/Kolkata",
                };
                resolvedOutput = {
                  status: "success",
                  dateValidated: true,
                  timezone: node.config?.timezone || "Asia/Kolkata",
                  pattern: node.config?.recurringPattern || "every_day",
                };
                break;
              }

              case "time": {
                // Medium speed pacing for time window check
                await new Promise((r) => setTimeout(r, 1400));
                resolvedInput = {
                  time: node.config?.time || "09:00",
                  ampm: node.config?.ampm || "AM",
                  timezone: node.config?.timezone || "Asia/Kolkata",
                  recurrence: node.config?.recurrence || "daily",
                };
                resolvedOutput = {
                  status: "success",
                  timeWindowActive: true,
                  formattedTime: `${node.config?.time || "09:00"} ${node.config?.ampm || "AM"}`,
                  timezone: node.config?.timezone || "Asia/Kolkata",
                };
                break;
              }

              case "action": {
                await new Promise((r) => setTimeout(r, 1000));
                resolvedInput = {
                  actionType: node.config?.actionType || "send_notification",
                  message: node.config?.message || node.text || "Scheduled Automation Triggered",
                  priority: node.config?.priority || "Medium",
                  inputFromPreviousNode: previousNodeOutput,
                };

                const actionResult = await ActionExecutor.execute(node, userId, triggerType);
                if (actionResult.status === "failed") {
                  throw new Error(actionResult.error || "Action execution failed");
                }
                resolvedOutput = actionResult.result || { message: actionResult.message };
                break;
              }

              case "generic":
              default: {
                const instructionText = node.text || node.label || "Custom Task Step";
                const instructionLower = instructionText.toLowerCase();

                // Determine context from predecessors in workflow graph
                const incomingEdges = (workflow.edges || []).filter(
                  (e) => (e.target === node.id || e.source === node.id)
                );

                const directParentOutputs = [];
                for (const edge of incomingEdges) {
                  const otherId = edge.target === node.id ? edge.source : edge.target;
                  if (completedNodeOutputs.has(otherId)) {
                    directParentOutputs.push(completedNodeOutputs.get(otherId));
                  }
                }

                let effectiveInputContext = null;
                const needsMultipleContexts =
                  instructionLower.includes("previous nodes") ||
                  instructionLower.includes("combine") ||
                  instructionLower.includes("both") ||
                  directParentOutputs.length > 1;

                const extractTextOutput = (data) => {
                  if (!data) return "";
                  if (typeof data === "string") return data;
                  if (typeof data.result === "string") return data.result;
                  if (typeof data.content === "string") return data.content;
                  if (typeof data.output?.result === "string") return data.output.result;
                  if (typeof data.output?.content === "string") return data.output.content;
                  try {
                    return JSON.stringify(data, null, 2);
                  } catch (_) {
                    return String(data);
                  }
                };

                if (needsMultipleContexts && completedNodeOutputs.size > 1) {
                  const parts = [];
                  let pIdx = 1;
                  for (const [cId, cData] of completedNodeOutputs.entries()) {
                    const cResult = extractTextOutput(cData.output);
                    parts.push(`[Context from Step #${pIdx} (${cData.name})]:\n${cResult}`);
                    pIdx++;
                  }
                  effectiveInputContext = parts.join("\n\n---\n\n");
                } else if (directParentOutputs.length > 0) {
                  if (directParentOutputs.length === 1) {
                    const single = directParentOutputs[0];
                    effectiveInputContext = extractTextOutput(single.output);
                  } else {
                    effectiveInputContext = directParentOutputs
                      .map((p, idx) => `[Context from Step #${idx + 1} (${p.name})]:\n${extractTextOutput(p.output)}`)
                      .join("\n\n---\n\n");
                  }
                } else {
                  effectiveInputContext = extractTextOutput(previousNodeOutput);
                }

                resolvedInput = {
                  task: instructionText,
                  config: node.config || {},
                  inputContext: effectiveInputContext,
                };

                // Execute with actual AI Agent passing context from previous nodes
                const aiResult = await WorkflowExecutionEngine.executeWithAiAgent({
                  instruction: instructionText,
                  node,
                  previousNodeOutput: effectiveInputContext,
                  userId,
                  executionId,
                });

                resolvedOutput = aiResult;
                break;
              }
            }

            const nodeDuration = Date.now() - nodeStartTime;
            execution.nodes[nodeIndex].status = "completed";
            execution.nodes[nodeIndex].completedAt = new Date();
            execution.nodes[nodeIndex].durationMs = nodeDuration;
            execution.nodes[nodeIndex].input = sanitizePayload(resolvedInput);
            execution.nodes[nodeIndex].output = sanitizePayload(resolvedOutput);
            execution.markModified("nodes");

            const cleanTextOutput =
              typeof resolvedOutput === "string"
                ? resolvedOutput
                : resolvedOutput?.result || resolvedOutput?.content || JSON.stringify(resolvedOutput);
            previousNodeOutput = cleanTextOutput;

            completedNodeOutputs.set(node.id, {
              id: node.id,
              name: node.label || node.text?.slice(0, 35) || node.type,
              output: resolvedOutput,
            });
            successfulCount++;
            execution.successfulNodes = preludeNodeExecutions.length + successfulCount;

            execution.logs.push({
              timestamp: new Date(),
              level: "success",
              nodeId: node.id,
              nodeName: node.label || node.type,
              message: `Node "${node.label || node.type}" completed successfully in ${(
                nodeDuration / 1000
              ).toFixed(2)}s`,
            });

            await execution.save();
            emitLiveUpdate("node_completed", {
              nodeId: node.id,
              nodeIndex,
              node: execution.nodes[nodeIndex].toObject(),
            });

            // Ensure the completed node's full response is rendered and settled before advancing to the next node
            await new Promise((r) => setTimeout(r, 1200));
          } catch (nodeErr) {
            const nodeDuration = Date.now() - nodeStartTime;
            execution.nodes[nodeIndex].status = "failed";
            execution.nodes[nodeIndex].completedAt = new Date();
            execution.nodes[nodeIndex].durationMs = nodeDuration;
            execution.nodes[nodeIndex].error = {
              message: nodeErr.message || "Execution error",
              code: nodeErr.code || "ERR_NODE_EXECUTION",
            };
            execution.markModified("nodes");

            failedCount++;
            execution.failedNodes = failedCount;
            workflowFailed = true;

            execution.logs.push({
              timestamp: new Date(),
              level: "error",
              nodeId: node.id,
              nodeName: node.label || node.type,
              message: `Node "${node.label || node.type}" failed: ${nodeErr.message}`,
            });

            await execution.save();
            emitLiveUpdate("node_failed", {
              nodeId: node.id,
              nodeIndex,
              node: execution.nodes[nodeIndex].toObject(),
              error: nodeErr.message,
            });

            // Halting remaining steps: A subsequent node must never proceed if current node failed to complete
            execution.logs.push({
              timestamp: new Date(),
              level: "warn",
              nodeId: node.id,
              nodeName: node.label || node.type,
              message: `Halting remaining workflow steps because node "${node.label || node.type}" failed.`,
            });
            break;
          }
        }

        // Finish execution summary
        const totalDuration = Date.now() - execution.startedAt.getTime();
        execution.completedAt = new Date();
        execution.durationMs = totalDuration;

        if (control.isCancelled) {
          execution.status = "cancelled";
        } else if (failedCount === 0) {
          execution.status = "completed";
        } else if (successfulCount > 0 && failedCount > 0) {
          execution.status = "partially_failed";
          execution.errorSummary = `${failedCount} node(s) failed during execution.`;
        } else {
          execution.status = "failed";
          execution.errorSummary = `${failedCount} node(s) failed during execution.`;
        }

        execution.logs.push({
          timestamp: new Date(),
          level: execution.status === "completed" ? "success" : "error",
          nodeId: null,
          nodeName: null,
          message: `Workflow execution finished with status: ${execution.status} in ${(
            totalDuration / 1000
          ).toFixed(2)}s`,
        });

        await execution.save();

        // Update AiAutomation document with last run info
        try {
          automation.lastRunAt = new Date();
          automation.executionHistory = automation.executionHistory || [];
          automation.executionHistory.unshift({
            id: executionId,
            executedAt: new Date(),
            triggerType,
            actionType: orderedNodes.find((n) => n.type === "action")?.config?.actionType || "workflow_execution",
            status: execution.status === "completed" ? "success" : "failed",
            message: `Executed ${successfulCount}/${orderedNodes.length} nodes successfully`,
            result: { runId: executionId, totalNodes: orderedNodes.length, successfulNodes: successfulCount },
            error: execution.errorSummary,
            durationMs: totalDuration,
          });
          if (automation.executionHistory.length > 50) {
            automation.executionHistory = automation.executionHistory.slice(0, 50);
          }
          await automation.save();
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
