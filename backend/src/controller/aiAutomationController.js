import AiAutomation from "../models/aiAutomationModel.js";

export class AiAutomationController {
  /**
   * GET /api/automation
   * Retrieve the authenticated user's automation canvas.
   * Creates an empty canvas if one does not exist yet.
   */
  static async getAutomation(req, res) {
    try {
      const userId = req.user._id;

      let automation = await AiAutomation.findOne({ userId });

      if (!automation) {
        automation = await AiAutomation.create({
          userId,
          name: "AI Automation Workspace",
          nodes: [], // Zero predefined nodes
          edges: [],
        });
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
   * Persist entire canvas state (nodes, edges, name) for authenticated user.
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

      // Validate node IDs
      const nodeIds = new Set(nodes.map((n) => n.id));

      // Filter edges to ensure they only reference existing nodes
      const validEdges = Array.isArray(edges)
        ? edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
        : [];

      const automation = await AiAutomation.findOneAndUpdate(
        { userId },
        {
          $set: {
            name: name || "AI Automation Workspace",
            nodes,
            edges: validEdges,
          },
        },
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
   * Add a new generic user node to the canvas.
   */
  static async addNode(req, res) {
    try {
      const userId = req.user._id;
      const { id, text, position } = req.body;

      const nodeId = id || `node_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const nodePosition = {
        x: typeof position?.x === "number" ? Math.round(position.x) : 250,
        y: typeof position?.y === "number" ? Math.round(position.y) : 150,
      };

      const newNode = {
        id: nodeId,
        text: typeof text === "string" ? text : "",
        position: nodePosition,
        width: 240,
        height: 110,
      };

      let automation = await AiAutomation.findOne({ userId });
      if (!automation) {
        automation = new AiAutomation({
          userId,
          name: "AI Automation Workspace",
          nodes: [newNode],
          edges: [],
        });
      } else {
        automation.nodes.push(newNode);
      }

      await automation.save();

      return res.status(201).json({
        success: true,
        message: "Node created successfully",
        node: newNode,
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
   * Update a specific node's text and/or position.
   */
  static async updateNode(req, res) {
    try {
      const userId = req.user._id;
      const { nodeId } = req.params;
      const { text, position } = req.body;

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

      if (text !== undefined) {
        node.text = String(text);
      }

      if (position && typeof position.x === "number" && typeof position.y === "number") {
        node.position = {
          x: Math.round(position.x),
          y: Math.round(position.y),
        };
      }

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
   * Delete a node and all edges connected to it.
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

      // Remove the node
      const initialNodeCount = automation.nodes.length;
      automation.nodes = automation.nodes.filter((n) => n.id !== nodeId);

      if (automation.nodes.length === initialNodeCount) {
        return res.status(404).json({
          success: false,
          message: `Node with ID "${nodeId}" not found`,
        });
      }

      // Cascade remove connected edges
      automation.edges = automation.edges.filter(
        (e) => e.source !== nodeId && e.target !== nodeId
      );

      await automation.save();

      return res.status(200).json({
        success: true,
        message: "Node and associated connections removed",
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
   * Create a connection between two nodes.
   */
  static async createEdge(req, res) {
    try {
      const userId = req.user._id;
      const { id, source, target, sourceHandle, targetHandle } = req.body;

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

      // Validate both nodes exist in the canvas
      const sourceExists = automation.nodes.some((n) => n.id === source);
      const targetExists = automation.nodes.some((n) => n.id === target);

      if (!sourceExists || !targetExists) {
        return res.status(400).json({
          success: false,
          message: "Connection references a nonexistent node",
        });
      }

      // Prevent duplicate connection
      const duplicate = automation.edges.some(
        (e) => e.source === source && e.target === target
      );
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: "Connection already exists between these nodes",
        });
      }

      const edgeId = id || `edge_${source}_${target}_${Date.now()}`;
      const newEdge = {
        id: edgeId,
        source,
        target,
        sourceHandle: sourceHandle || "bottom",
        targetHandle: targetHandle || "top",
      };

      automation.edges.push(newEdge);
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
   * Remove a connection by ID.
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

      const initialCount = automation.edges.length;
      automation.edges = automation.edges.filter((e) => e.id !== edgeId);

      if (automation.edges.length === initialCount) {
        return res.status(404).json({
          success: false,
          message: `Connection with ID "${edgeId}" not found`,
        });
      }

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
}

export default AiAutomationController;
