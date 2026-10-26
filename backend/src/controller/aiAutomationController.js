import AiAutomation from "../models/aiAutomationModel.js";
import ActionExecutor from "../services/automation/actionExecutor.js";
import WorkflowExecutionEngine from "../services/automation/workflowExecutionEngine.js";

/**
 * Compute the sequential order and labels for automation nodes.
 * - The very first created node (nodes[0]) or trigger is #node1.
 * - Any newly added node that is not connected has stepNumber: null, sequenceLabel: "node_".
 * - When a node is connected from #node1, it gets #node2, and downstream nodes get #node3, etc.
 */
export function computeNodeSequences(nodes, edges) {
  if (!Array.isArray(nodes) || nodes.length === 0) return [];

  // Root node is trigger node if exists, otherwise nodes[0]
  const rootNode = nodes.find((n) => n.type === "trigger") || nodes[0];
  const stepMap = new Map();
  stepMap.set(rootNode.id, 1);

  // Traverse directed edges starting from rootNode
  const queue = [rootNode.id];
  const visited = new Set([rootNode.id]);

  while (queue.length > 0) {
    const currentId = queue.shift();
    const currentStep = stepMap.get(currentId);

    const outgoing = (edges || []).filter((e) => e.source === currentId);
    for (const edge of outgoing) {
      if (!visited.has(edge.target)) {
        visited.add(edge.target);
        stepMap.set(edge.target, currentStep + 1);
        queue.push(edge.target);
      }
    }
  }

  // Update nodes with stepNumber and sequenceLabel
  for (const node of nodes) {
    const step = stepMap.get(node.id);
    if (step !== undefined) {
      node.stepNumber = step;
      node.sequenceLabel = `node${step}`;
    } else {
      node.stepNumber = null;
      node.sequenceLabel = "node_";
    }
  }

  return nodes;
}

export class AiAutomationController {
  /**
   * Helper to validate complete workflow rules.
   */
  static validateWorkflow(automation) {
    const nodes = automation.nodes || [];
    const edges = automation.edges || [];
    const errors = [];

    const triggerNodes = nodes.filter((n) => n.type === "trigger");
    if (triggerNodes.length === 0) {
      errors.push("A Trigger node is required to start the automation.");
    } else if (triggerNodes.length > 1) {
      errors.push("Only one Trigger node is allowed per automation.");
    }

    const triggerNode = triggerNodes[0];
    const triggerMode = triggerNode?.config?.triggerMode || "schedule";

    const actionNodes = nodes.filter((n) => n.type === "action");
    if (actionNodes.length === 0) {
      errors.push("Action node is missing. Add and configure an Action node before activating.");
    } else {
      const actionNode = actionNodes[0];
      const hasTriggerActionEdge = edges.some(
        (e) =>
          (e.source === triggerNode?.id && e.target === actionNode.id) ||
          (e.source === actionNode.id && e.target === triggerNode?.id)
      );
      if (!hasTriggerActionEdge) {
        errors.push("Action node must be connected directly to the Trigger node.");
      }
      if (!actionNode.config?.actionType) {
        errors.push("Action node is incomplete. Select an action type.");
      }
    }

    if (triggerMode === "schedule") {
      const dateNodes = nodes.filter((n) => n.type === "date");
      if (dateNodes.length === 0) {
        errors.push("Date node is missing. Add and connect a Date node for scheduled automation.");
      } else {
        const dateNode = dateNodes[0];
        const hasTriggerDateEdge = edges.some(
          (e) =>
            (e.source === triggerNode?.id && e.target === dateNode.id) ||
            (e.source === dateNode.id && e.target === triggerNode?.id)
        );
        if (!hasTriggerDateEdge) {
          errors.push("Date node must be connected directly to the Trigger node.");
        }
      }

      const timeNodes = nodes.filter((n) => n.type === "time");
      if (timeNodes.length === 0) {
        errors.push("Time node is missing. Add and connect a Time node for scheduled automation.");
      } else {
        const timeNode = timeNodes[0];
        const hasTriggerTimeEdge = edges.some(
          (e) =>
            (e.source === triggerNode?.id && e.target === timeNode.id) ||
            (e.source === timeNode.id && e.target === triggerNode?.id)
        );
        if (!hasTriggerTimeEdge) {
          errors.push("Time node must be connected directly to the Trigger node.");
        }
      }
    }

    // Check invalid edges between Date, Action, Time
    for (const edge of edges) {
      const src = nodes.find((n) => n.id === edge.source);
      const tgt = nodes.find((n) => n.id === edge.target);
      if (src && tgt) {
        const childTypes = ["date", "action", "time"];
        if (childTypes.includes(src.type) && childTypes.includes(tgt.type)) {
          errors.push(
            `Invalid connection: ${src.type} and ${tgt.type} cannot connect to one another.`
          );
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * GET /api/automation
   * Retrieve the authenticated user's automation canvas.
   */
  static async getAutomation(req, res) {
    try {
      const userId = req.user._id;

      let automation = await AiAutomation.findOne({ userId });

      if (!automation) {
        automation = await AiAutomation.create({
          userId,
          name: "AI Automation Workspace",
          nodes: [],
          edges: [],
          isActive: false,
          executionHistory: [],
        });
      } else if (automation.nodes && automation.nodes.length > 0) {
        computeNodeSequences(automation.nodes, automation.edges);
        await automation.save();
      }

      return res.status(200).json({
        success: true,
        data: automation,
      });
    } catch (err) {
      console.error("[AiAutomationController getAutomation Error]:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to load automation canvas",
        error: err.message,
      });
    }
  }

  /**
   * POST /api/automation/save
   * Persist entire canvas state.
   */
  static async saveAutomation(req, res) {
    try {
      const userId = req.user._id;
      const { nodes, edges, name } = req.body;

      if (!Array.isArray(nodes)) {
        return res.status(400).json({
          success: false,
          message: "Nodes must be provided as an array",
        });
      }

      const nodeIds = new Set(nodes.map((n) => n.id));
      const validEdges = Array.isArray(edges)
        ? edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
        : [];

      computeNodeSequences(nodes, validEdges);

      const hasScheduleNodes = nodes.some(
        (n) => (n.type === "date" || n.type === "time") && n.status === "configured"
      );

      const updateFields = {
        name: name || "AI Automation Workspace",
        nodes,
        edges: validEdges,
      };

      if (hasScheduleNodes) {
        updateFields.isActive = true;
      }

      const automation = await AiAutomation.findOneAndUpdate(
        { userId },
        { $set: updateFields },
        { new: true, upsert: true, runValidators: true }
      );

      return res.status(200).json({
        success: true,
        message: "Automation saved successfully",
        data: automation,
      });
    } catch (err) {
      console.error("[AiAutomationController saveAutomation Error]:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to save automation canvas",
        error: err.message,
      });
    }
  }

  /**
   * POST /api/automation/node
   * Add a node (trigger, date, action, time, or generic).
   */
  static async addNode(req, res) {
    try {
      const userId = req.user._id;
      const { id, type = "generic", label, text, config, position } = req.body;

      let automation = await AiAutomation.findOne({ userId });
      if (!automation) {
        automation = new AiAutomation({
          userId,
          name: "AI Automation Workspace",
          nodes: [],
          edges: [],
          isActive: false,
        });
      }

      // Check: Only 1 trigger node permitted
      if (type === "trigger" && automation.nodes.some((n) => n.type === "trigger")) {
        return res.status(400).json({
          success: false,
          message: "Only one Trigger node is allowed per automation.",
        });
      }

      const nodeId = id || `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const nodePosition = {
        x: typeof position?.x === "number" ? Math.round(position.x) : 250,
        y: typeof position?.y === "number" ? Math.round(position.y) : 150,
      };

      const defaultConfigs = {
        trigger: { triggerMode: "schedule" },
        date: { dateMode: "specific", specificDate: "", recurringPattern: "every_day", timezone: "Asia/Kolkata" },
        action: { actionType: "send_notification", message: "", priority: "Medium" },
        time: { time: "09:00", ampm: "AM", timezone: "Asia/Kolkata", recurrence: "daily" },
      };

      const newNode = {
        id: nodeId,
        type: ["trigger", "date", "action", "time"].includes(type) ? type : "generic",
        label: label || (type.charAt(0).toUpperCase() + type.slice(1)),
        text: typeof text === "string" ? text : "",
        status: "incomplete",
        stepNumber: null,
        sequenceLabel: "node_",
        config: config || defaultConfigs[type] || {},
        position: nodePosition,
        width: 260,
        height: 100,
      };

      automation.nodes.push(newNode);

      computeNodeSequences(automation.nodes, automation.edges);
      await automation.save();

      const createdNode = automation.nodes.find((n) => n.id === nodeId) || newNode;

      return res.status(201).json({
        success: true,
        message: `${newNode.label} node added successfully`,
        node: createdNode,
        data: automation,
      });
    } catch (err) {
      console.error("[AiAutomationController addNode Error]:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to create node",
        error: err.message,
      });
    }
  }

  /**
   * PUT /api/automation/node/:nodeId
   * Update a specific node's config, text, status, and/or position.
   */
  static async updateNode(req, res) {
    try {
      const userId = req.user._id;
      const { nodeId } = req.params;
      const { text, label, status, config, position } = req.body;

      const automation = await AiAutomation.findOne({ userId });
      if (!automation) {
        return res.status(404).json({
          success: false,
          message: "Automation canvas not found",
        });
      }

      const node = automation.nodes.find((n) => n.id === nodeId);
      if (!node) {
        return res.status(404).json({
          success: false,
          message: `Node with ID "${nodeId}" not found`,
        });
      }

      if (text !== undefined) node.text = String(text);
      if (label !== undefined) node.label = String(label);
      if (status !== undefined) node.status = status;
      if (config && typeof config === "object") {
        node.config = { ...(node.config || {}), ...config };
        node.status = "configured";
      }

      if (position && typeof position.x === "number" && typeof position.y === "number") {
        node.position = {
          x: Math.round(position.x),
          y: Math.round(position.y),
        };
      }

      if (node.type === "date" || node.type === "time") {
        automation.isActive = true;
      }

      computeNodeSequences(automation.nodes, automation.edges);
      await automation.save();

      return res.status(200).json({
        success: true,
        message: "Node updated successfully",
        node,
        data: automation,
      });
    } catch (err) {
      console.error("[AiAutomationController updateNode Error]:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to update node",
        error: err.message,
      });
    }
  }

  /**
   * DELETE /api/automation/node/:nodeId
   */
  static async deleteNode(req, res) {
    try {
      const userId = req.user._id;
      const { nodeId } = req.params;

      const automation = await AiAutomation.findOne({ userId });
      if (!automation) {
        return res.status(404).json({
          success: false,
          message: "Automation canvas not found",
        });
      }

      const initialNodeCount = automation.nodes.length;
      automation.nodes = automation.nodes.filter((n) => n.id !== nodeId);

      if (automation.nodes.length === initialNodeCount) {
        return res.status(404).json({
          success: false,
          message: `Node with ID "${nodeId}" not found`,
        });
      }

      // Cascade remove all edges connected to this node
      automation.edges = automation.edges.filter(
        (e) => e.source !== nodeId && e.target !== nodeId
      );

      computeNodeSequences(automation.nodes, automation.edges);
      await automation.save();

      return res.status(200).json({
        success: true,
        message: "Node and associated connections removed",
        nodeId,
        data: automation,
      });
    } catch (err) {
      console.error("[AiAutomationController deleteNode Error]:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to delete node",
        error: err.message,
      });
    }
  }

  /**
   * POST /api/automation/edge
   * Enforces connection rules:
   * 1. Trigger is central: Trigger -> Date, Trigger -> Action, Trigger -> Time
   * 2. Date, Action, Time must NOT connect to one another!
   */
  static async createEdge(req, res) {
    try {
      const userId = req.user._id;
      let { id, source, target, sourceHandle, targetHandle } = req.body;

      if (!source || !target) {
        return res.status(400).json({
          success: false,
          message: "Both source and target node IDs are required",
        });
      }

      if (source === target) {
        return res.status(400).json({
          success: false,
          message: "A node cannot be connected to itself",
        });
      }

      let automation = await AiAutomation.findOne({ userId });
      if (!automation) {
        return res.status(404).json({
          success: false,
          message: "Automation canvas not found",
        });
      }

      const sourceNode = automation.nodes.find((n) => n.id === source);
      const targetNode = automation.nodes.find((n) => n.id === target);

      if (!sourceNode || !targetNode) {
        return res.status(400).json({
          success: false,
          message: "Connection references a nonexistent node",
        });
      }

      const childTypes = ["date", "action", "time"];

      // RULE 5: Date, Action, and Time must NOT connect to one another!
      if (childTypes.includes(sourceNode.type) && childTypes.includes(targetNode.type)) {
        return res.status(400).json({
          success: false,
          message: `${sourceNode.type.toUpperCase()} and ${targetNode.type.toUpperCase()} must NOT connect to one another. They must connect directly to the Trigger node.`,
        });
      }

      // Normalize so Trigger is always source: Trigger -> Child / Downstream
      if (sourceNode.type !== "trigger" && targetNode.type === "trigger") {
        const temp = source;
        source = target;
        target = temp;
      }

      // Check if connection already exists between these nodes (make idempotent)
      const existingEdge = automation.edges.find(
        (e) => (e.source === source && e.target === target) ||
               (e.source === target && e.target === source)
      );
      if (existingEdge) {
        return res.status(200).json({
          success: true,
          message: "Connection already exists between these nodes",
          edge: existingEdge,
          data: automation,
        });
      }

      const edgeId = id || `edge_${source}_${target}_${Date.now()}`;
      const newEdge = {
        id: edgeId,
        source,
        target,
        sourceHandle: sourceHandle || "right",
        targetHandle: targetHandle || "left",
      };

      automation.edges.push(newEdge);
      computeNodeSequences(automation.nodes, automation.edges);
      await automation.save();

      return res.status(201).json({
        success: true,
        message: "Connection created successfully",
        edge: newEdge,
        data: automation,
      });
    } catch (err) {
      console.error("[AiAutomationController createEdge Error]:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to create connection",
        error: err.message,
      });
    }
  }

  /**
   * DELETE /api/automation/edge/:edgeId
   */
  static async deleteEdge(req, res) {
    try {
      const userId = req.user._id;
      const { edgeId } = req.params;

      const automation = await AiAutomation.findOne({ userId });
      if (!automation) {
        return res.status(404).json({
          success: false,
          message: "Automation canvas not found",
        });
      }

      automation.edges = automation.edges.filter((e) => e.id !== edgeId);
      computeNodeSequences(automation.nodes, automation.edges);
      await automation.save();

      return res.status(200).json({
        success: true,
        message: "Connection removed successfully",
        data: automation,
      });
    } catch (err) {
      console.error("[AiAutomationController deleteEdge Error]:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to remove connection",
        error: err.message,
      });
    }
  }

  /**
   * POST /api/automation/validate
   * Validate the workflow configuration and connections.
   */
  static async validate(req, res) {
    try {
      const userId = req.user._id;
      const automation = await AiAutomation.findOne({ userId });

      if (!automation) {
        return res.status(404).json({
          success: false,
          message: "Automation canvas not found",
        });
      }

      const validation = AiAutomationController.validateWorkflow(automation);

      return res.status(200).json({
        success: true,
        isValid: validation.isValid,
        errors: validation.errors,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Validation check failed",
        error: err.message,
      });
    }
  }

  /**
   * POST /api/automation/toggle-active
   * Validate and toggle active automation status.
   */
  static async toggleActive(req, res) {
    try {
      const userId = req.user._id;
      const automation = await AiAutomation.findOne({ userId });

      if (!automation) {
        return res.status(404).json({
          success: false,
          message: "Automation canvas not found",
        });
      }

      // If turning on, validate first!
      if (!automation.isActive) {
        const validation = AiAutomationController.validateWorkflow(automation);
        if (!validation.isValid) {
          return res.status(400).json({
            success: false,
            message: validation.errors[0] || "Automation configuration is incomplete or invalid.",
            errors: validation.errors,
          });
        }
        automation.isActive = true;
      } else {
        automation.isActive = false;
      }

      await automation.save();

      return res.status(200).json({
        success: true,
        message: automation.isActive
          ? "Automation activated successfully"
          : "Automation deactivated",
        isActive: automation.isActive,
        data: automation,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Failed to update automation activation state",
        error: err.message,
      });
    }
  }

  /**
   * POST /api/automation/run
   * Execute the workflow run using WorkflowExecutionEngine.
   */
  static async runNow(req, res) {
    try {
      const userId = req.user._id;
      const automation = await AiAutomation.findOne({ userId });

      if (!automation) {
        return res.status(404).json({
          success: false,
          message: "Automation canvas not found",
        });
      }

      if (!automation.nodes || automation.nodes.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No nodes configured in this automation.",
        });
      }

      const { executionId, execution, completionPromise } =
        await WorkflowExecutionEngine.run({
          userId,
          automationId: automation._id,
          triggerType: "manual",
        });

      // Wait for execution to finish (or resolve immediately for UI)
      await completionPromise;

      const updatedAutomation = await AiAutomation.findOne({ userId });

      return res.status(200).json({
        success: execution.status !== "failed",
        message:
          execution.status === "failed"
            ? `Automation execution failed: ${execution.errorSummary || "Error"}`
            : "Workflow executed successfully",
        executionId,
        result: execution,
        data: updatedAutomation,
      });
    } catch (err) {
      console.error("[AiAutomationController runNow Error]:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to execute automation action",
        error: err.message,
      });
    }
  }


  /**
   * GET /api/automation/history
   */
  static async getHistory(req, res) {
    try {
      const userId = req.user._id;
      const automation = await AiAutomation.findOne({ userId }).select("executionHistory lastRunAt nextRunAt name isActive");
      return res.status(200).json({
        success: true,
        data: automation?.executionHistory || [],
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Failed to load execution history",
        error: err.message,
      });
    }
  }
}

export default AiAutomationController;
