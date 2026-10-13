import axios from "axios";
import AiContext from "../models/aiContextModel.js";
import User from "../models/authModel.js";
import { googleDriveService } from "../services/google/googleDriveService.js";
import sheetsService from "../google/sheetsService.js";
import SpreadsheetIngestionService from "../services/data/spreadsheetIngestionService.js";
import MetaAdsMapper from "../services/meta/metaAdsMapper.js";
import SpreadsheetSyncService from "../services/data/spreadsheetSyncService.js";

// Valid parent to child connection hierarchy mapping
export const ALLOWED_CONNECTION_RULES = {
  user_input: ["business_unit"],
  business_unit: ["ad_channel", "marketing_brief", "product", "data_warehouse"],
  ad_channel: ["marketing_brief", "product", "data_warehouse"],
  marketing_brief: ["ad_channel", "product", "data_warehouse"],
  product: ["ad_channel", "marketing_brief", "data_warehouse"],
  data_warehouse: ["ad_channel", "marketing_brief", "product"],
};

export const NODE_LABELS = {
  user_input: "Customer / User",
  business_unit: "Business Unit",
  ad_channel: "Ad Channel",
  marketing_brief: "Marketing Brief",
  product: "Product",
  data_warehouse: "Data Warehouse",
};

export function computeWorkflowFlows(nodes = [], edges = [], defaultName = "Primary AI Context Workflow") {
  if (!nodes || nodes.length === 0) return [];

  const nodeMap = new Map();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  const childMap = new Map();
  const parentMap = new Map();

  (edges || []).forEach((edge) => {
    if (!childMap.has(edge.source)) childMap.set(edge.source, []);
    childMap.get(edge.source).push(edge.target);
    parentMap.set(edge.target, edge.source);
  });

  // Global nodes by type for unified tree fallback
  const allChannels = nodes.filter((n) => n.type === "ad_channel");
  const allBriefs = nodes.filter((n) => n.type === "marketing_brief");
  const allProducts = nodes.filter((n) => n.type === "product");
  const allBusinesses = nodes.filter((n) => n.type === "business_unit");
  const allWarehouses = nodes.filter((n) => n.type === "data_warehouse");

  let rootNodes = nodes.filter((n) => n.isRoot || n.type === "user_input" || !parentMap.has(n.id));
  if (rootNodes.length === 0 && nodes.length > 0) {
    rootNodes = [nodes[0]];
  }

  const flows = [];
  const visitedPaths = new Set();

  function traverse(currentNode, currentPath, stepNum) {
    const parentNodeId = parentMap.get(currentNode.id);
    const parentNode = parentNodeId ? nodeMap.get(parentNodeId) : null;

    const stepInfo = {
      step: stepNum,
      nodeId: currentNode.id,
      type: currentNode.type,
      label: currentNode.label || currentNode.data?.name || currentNode.type,
      subtitle: currentNode.subtitle || "",
      contextTag: currentNode.contextTag || currentNode.data?.contextTag || defaultName,
      previousNode: parentNode
        ? {
            id: parentNode.id,
            label: parentNode.label || parentNode.data?.name || parentNode.type,
            type: parentNode.type,
          }
        : null,
      details: {
        name: currentNode.data?.name || currentNode.label,
        description: currentNode.data?.description || "",
        channelName: currentNode.data?.channelName || currentNode.data?.channel || "",
        channel: currentNode.data?.channel || currentNode.data?.channelName || "",
        adAccountId: currentNode.data?.adAccountId || "",
        accountName: currentNode.data?.accountName || "",
        funnelEvent: currentNode.data?.funnelEvent || "",
        funnelDescription: currentNode.data?.funnelDescription || "",
        metrics: currentNode.data?.metrics || "",
        kpis: currentNode.data?.kpis || "",
        productName: currentNode.data?.productName || "",
        productUrl: currentNode.data?.productUrl || "",
        productPrice: currentNode.data?.productPrice || 0,
        productPlatforms: currentNode.data?.productPlatforms || ["Web"],
        products: currentNode.data?.products || [],
        catalogCount: currentNode.data?.catalogCount || currentNode.data?.products?.length || 0,
        warehouseSource: currentNode.data?.warehouseSource || "both",
        sheetUrl: currentNode.data?.sheetUrl || "",
        excelProvider: currentNode.data?.excelProvider || "Google Sheets",
        workbookName: currentNode.data?.workbookName || "",
        worksheetName: currentNode.data?.worksheetName || "",
        excelSyncStatus: currentNode.data?.excelSyncStatus || "NOT_CONNECTED",
        googleDriveConnected: Boolean(currentNode.data?.googleDriveConnected),
        googleDriveEmail: currentNode.data?.googleDriveEmail || "",
        googleDriveFolderId: currentNode.data?.googleDriveFolderId || "",
        dataLevel: currentNode.data?.dataLevel || currentNode.data?.dataLabels || "",
        dataLabels: currentNode.data?.dataLabels || currentNode.data?.dataLevel || "",
        databasePlatform: currentNode.data?.databasePlatform || "Excel Sheet & Google Drive",
        config: currentNode.data?.config || {},
      },
    };

    const newPath = [...currentPath, stepInfo];
    const childrenIds = childMap.get(currentNode.id) || [];

    if (childrenIds.length === 0) {
      const pathKey = newPath.map((p) => p.nodeId).join("->");
      if (!visitedPaths.has(pathKey)) {
        visitedPaths.add(pathKey);

        const flowSummary = newPath.map((p) => `${p.label} [${p.type}]`).join(" ➔ ");

        const channelNode = newPath.find((p) => p.type === "ad_channel") || allChannels[0];
        const briefNode = newPath.find((p) => p.type === "marketing_brief") || allBriefs[0];
        const productNode = newPath.find((p) => p.type === "product") || allProducts[0];
        const businessNode = newPath.find((p) => p.type === "business_unit") || allBusinesses[0];
        const warehouseNode = newPath.find((p) => p.type === "data_warehouse") || allWarehouses[0];

        const channelDetails = channelNode?.details || channelNode?.data || {};
        const briefDetails = briefNode?.details || briefNode?.data || {};
        const productDetails = productNode?.details || productNode?.data || {};
        const businessDetails = businessNode?.details || businessNode?.data || {};
        const warehouseDetails = warehouseNode?.details || warehouseNode?.data || {};

        const campaignParams = {
          name:
            briefDetails?.name && briefDetails?.name !== "Marketing Brief"
              ? briefDetails.name
              : productDetails?.productName
              ? `${productDetails.productName} Growth Campaign`
              : `${businessDetails?.name || "Marketing"} Campaign`,
          channel: channelDetails?.channelName || channelDetails?.channel || "Meta Ads",
          accountId: channelDetails?.adAccountId || "",
          accountName: channelDetails?.accountName || "",
          funnelEvent: channelDetails?.funnelEvent || "Purchase",
          funnelDescription: channelDetails?.funnelDescription || "",
          metrics: briefDetails?.metrics || "",
          kpis: briefDetails?.kpis || "",
          briefDescription: briefDetails?.description || "",
          productName: productDetails?.productName || (productDetails?.products?.[0]?.name) || "",
          productUrl: productDetails?.productUrl || (productDetails?.products?.[0]?.url) || "",
          productPrice: productDetails?.productPrice !== undefined ? productDetails.productPrice : (productDetails?.products?.[0]?.price || ""),
          productPlatforms: productDetails?.productPlatforms || ["Web"],
          products: productDetails?.products || [],
          catalogCount: productDetails?.catalogCount || productDetails?.products?.length || 0,
          dataLevel: warehouseDetails?.dataLevel || warehouseDetails?.dataLabels || "",
          dataLabels: warehouseDetails?.dataLabels || warehouseDetails?.dataLevel || "",
          databasePlatform: warehouseDetails?.databasePlatform || "Excel Sheet & Google Drive",
          warehouseSource: warehouseDetails?.warehouseSource || "both",
          sheetUrl: warehouseDetails?.sheetUrl || "",
          excelProvider: warehouseDetails?.excelProvider || "Google Sheets",
          workbookName: warehouseDetails?.workbookName || "",
          worksheetName: warehouseDetails?.worksheetName || "",
          excelSyncStatus: warehouseDetails?.excelSyncStatus || "NOT_CONNECTED",
          googleDriveConnected: Boolean(warehouseDetails?.googleDriveConnected),
          googleDriveEmail: warehouseDetails?.googleDriveEmail || "",
          googleDriveFolderId: warehouseDetails?.googleDriveFolderId || "",
          status: "ACTIVE",
        };

        flows.push({
          flowIndex: flows.length + 1,
          flowTag: currentNode.contextTag || currentNode.data?.contextTag || defaultName,
          flowSummary,
          totalSteps: newPath.length,
          pathNodeIds: newPath.map((p) => p.nodeId),
          campaignLaunchParameters: campaignParams,
          steps: newPath,
        });
      }
      return;
    }

    for (const childId of childrenIds) {
      const childNode = nodeMap.get(childId);
      if (childNode) {
        traverse(childNode, newPath, stepNum + 1);
      }
    }
  }

  rootNodes.forEach((root) => {
    traverse(root, [], 1);
  });

  return flows;
}

export function sanitizeNode(n, parent = null, userName = "Customer User", defaultWorkflowName = "Primary Marketing Context") {
  if (!n) return null;
  const isRootNode = Boolean(n.isRoot || n.type === "user_input");
  const nodeLabel = isRootNode && (!n.label || n.label === "Customer / User" || n.label === "USER INPUT")
    ? userName
    : n.label || n.data?.name || "Node";

  const contextTag =
    n.contextTag ||
    n.data?.contextTag ||
    parent?.contextTag ||
    parent?.data?.contextTag ||
    defaultWorkflowName;

  const validTypes = ["user_input", "business_unit", "ad_channel", "marketing_brief", "product", "data_warehouse"];
  let type = n.type;
  if (!validTypes.includes(type)) {
    type = isRootNode ? "user_input" : "business_unit";
  }

  const rawProducts = Array.isArray(n.data?.products) ? n.data.products : [];
  const cleanProducts = rawProducts.map((p, idx) => ({
    id: String(p?.id || `prod_${idx}`),
    name: String(p?.name || ""),
    price: p?.price !== undefined ? p.price : "",
    url: String(p?.url || ""),
    sku: String(p?.sku || ""),
    category: String(p?.category || ""),
    platforms: Array.isArray(p?.platforms) ? p.platforms : ["Web"],
  }));

  const posX = typeof n.position?.x === "number" && !isNaN(n.position.x) ? n.position.x : 100;
  const posY = typeof n.position?.y === "number" && !isNaN(n.position.y) ? n.position.y : 200;

  return {
    id: String(n.id),
    type,
    label: String(nodeLabel),
    subtitle: String(n.subtitle || ""),
    contextTag: String(contextTag),
    previousNodeId: parent ? String(parent.id) : (n.previousNodeId || null),
    previousNodeLabel: parent ? String(parent.label || parent.data?.name || parent.type) : (n.previousNodeLabel || null),
    previousNodeType: parent ? String(parent.type) : (n.previousNodeType || null),
    stepIndex: parent ? (Number(parent.stepIndex) || 1) + 1 : (Number(n.stepIndex) || 1),
    isRoot: isRootNode,
    position: {
      x: posX,
      y: posY,
    },
    data: {
      name: String(n.data?.name || nodeLabel),
      description: String(n.data?.description || ""),
      contextTag: String(contextTag),
      channelName: String(n.data?.channelName || n.data?.channel || ""),
      channel: String(n.data?.channel || n.data?.channelName || ""),
      adAccountId: String(n.data?.adAccountId || ""),
      accountName: String(n.data?.accountName || ""),
      funnelEvent: String(n.data?.funnelEvent || ""),
      funnelDescription: String(n.data?.funnelDescription || ""),
      metrics: String(n.data?.metrics || ""),
      kpis: String(n.data?.kpis || ""),
      productName: String(n.data?.productName || ""),
      productUrl: String(n.data?.productUrl || ""),
      productPrice: n.data?.productPrice !== undefined ? n.data.productPrice : "",
      productPlatforms: Array.isArray(n.data?.productPlatforms) ? n.data.productPlatforms : ["Web"],
      products: cleanProducts,
      catalogCount: Number(n.data?.catalogCount) || cleanProducts.length,
      warehouseSource: String(n.data?.warehouseSource || "both"),
      sheetUrl: String(n.data?.sheetUrl || ""),
      excelProvider: String(n.data?.excelProvider || "Google Sheets"),
      workbookId: String(n.data?.workbookId || ""),
      workbookName: String(n.data?.workbookName || ""),
      worksheetId: String(n.data?.worksheetId || ""),
      worksheetName: String(n.data?.worksheetName || ""),
      excelSyncStatus: String(n.data?.excelSyncStatus || "NOT_CONNECTED"),
      lastSyncedAt: n.data?.lastSyncedAt || null,
      totalRows: Number(n.data?.totalRows) || 0,
      sheetColumns: Array.isArray(n.data?.sheetColumns) ? n.data.sheetColumns : [],
      sheetRows: Array.isArray(n.data?.sheetRows) ? n.data.sheetRows : [],
      sheetMetadata: typeof n.data?.sheetMetadata === "object" && n.data?.sheetMetadata !== null ? n.data.sheetMetadata : {},
      googleDriveConnected: Boolean(n.data?.googleDriveConnected),
      googleDriveEmail: String(n.data?.googleDriveEmail || ""),
      googleDriveFolderId: String(n.data?.googleDriveFolderId || ""),
      googleDriveFolderName: String(n.data?.googleDriveFolderName || ""),
      dataLevel: String(n.data?.dataLevel || n.data?.dataLabels || ""),
      dataLabels: String(n.data?.dataLabels || n.data?.dataLevel || ""),
      databasePlatform: String(n.data?.databasePlatform || "Excel Sheet & Google Drive"),
      config: typeof n.data?.config === "object" && n.data?.config !== null ? n.data.config : {},
    },
  };
}

export class AiContextController {
  // 1. Get Context for authenticated user (or initialize default root node)
  static async getContext(req, res) {
    try {
      const userId = req.user._id;
      const user = await User.findById(userId).lean();
      const userName = user?.name || "Customer User";

      let context = await AiContext.findOne({ userId }).lean();

      if (!context || !context.nodes || context.nodes.length === 0) {
        // Initialize default root node with user's registered name
        const defaultRootNode = {
          id: "root-node-1",
          type: "user_input",
          label: userName,
          subtitle: "Registered Customer Account",
          isRoot: true,
          position: { x: 420, y: 70 },
          data: {
            name: userName,
            description: `Primary customer context for ${userName}`,
            config: {
              email: user?.email || "",
              createdAt: user?.createdAt || new Date(),
            },
          },
        };

        const initialFlows = computeWorkflowFlows([defaultRootNode], [], `${userName}'s Marketing Context`);

        context = await AiContext.findOneAndUpdate(
          { userId },
          {
            $set: {
              userId,
              name: `${userName}'s Marketing Context`,
              nodes: [defaultRootNode],
              edges: [],
              flows: initialFlows,
              viewport: { x: 0, y: 0, zoom: 1 },
            },
          },
          { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
        ).lean();
      }

      return res.status(200).json({
        success: true,
        data: context,
      });
    } catch (error) {
      console.error("[Get AI Context Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch AI Context",
        error: error.message,
      });
    }
  }

  // 2. Save Context (nodes, edges, positions, configurations, flows)
  static async saveContext(req, res) {
    try {
      const userId = req.user._id;
      const { nodes = [], edges = [], viewport, name } = req.body;

      // Ensure user info is attached
      const user = await User.findById(userId).lean();
      const userName = user?.name || "Customer User";
      const workflowName = name || `${userName}'s Marketing Context`;

      const cleanNodes = Array.isArray(nodes) ? nodes : [];
      const nodeMap = new Map();
      cleanNodes.forEach((n) => nodeMap.set(n.id, n));

      const enrichedNodes = cleanNodes.map((n) => {
        const incomingEdge = (edges || []).find((e) => e.target === n.id);
        const parent = incomingEdge ? nodeMap.get(incomingEdge.source) : null;
        return sanitizeNode(n, parent, userName, workflowName);
      });

      // Compute and store structured connection flows from root to leaves
      const computedFlows = computeWorkflowFlows(enrichedNodes, edges || [], workflowName);

      const updated = await AiContext.findOneAndUpdate(
        { userId },
        {
          $set: {
            userId,
            name: workflowName,
            nodes: enrichedNodes,
            edges: edges || [],
            flows: computedFlows,
            viewport: viewport || { x: 0, y: 0, zoom: 1 },
          },
        },
        { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
      ).lean();

      return res.status(200).json({
        success: true,
        message: "AI Context canvas saved successfully!",
        data: updated,
      });
    } catch (error) {
      console.error("[Save AI Context Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to save AI Context",
        error: error.message,
      });
    }
  }

  // 3. Reset Context back to original root node
  static async resetContext(req, res) {
    try {
      const userId = req.user._id;
      const user = await User.findById(userId).lean();
      const userName = user?.name || "Customer User";
      const workflowName = `${userName}'s Marketing Context`;

      const defaultRootNode = {
        id: "root-node-1",
        type: "user_input",
        label: userName,
        subtitle: "Registered Customer Account",
        isRoot: true,
        position: { x: 420, y: 70 },
        data: {
          name: userName,
          description: `Primary customer context for ${userName}`,
        },
      };

      const resetFlows = computeWorkflowFlows([defaultRootNode], [], workflowName);

      const resetData = await AiContext.findOneAndUpdate(
        { userId },
        {
          $set: {
            userId,
            name: workflowName,
            nodes: [defaultRootNode],
            edges: [],
            flows: resetFlows,
            viewport: { x: 0, y: 0, zoom: 1 },
          },
        },
        { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
      ).lean();

      return res.status(200).json({
        success: true,
        message: "AI Context reset to default root node",
        data: resetData,
      });
    } catch (error) {
      console.error("[Reset AI Context Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to reset AI Context",
        error: error.message,
      });
    }
  }

  // 4. Delete single node from DB and purge all associated connections
  static async deleteNode(req, res) {
    try {
      const userId = req.user._id;
      const { nodeId } = req.params;
      const bodyNodes = req.body?.nodes;
      const bodyEdges = req.body?.edges;

      const user = await User.findById(userId).lean();
      const userName = user?.name || "Customer User";

      const context = await AiContext.findOne({ userId }).lean();

      let existingNodes = [];
      let existingEdges = [];

      if (Array.isArray(bodyNodes) && bodyNodes.length > 0) {
        existingNodes = bodyNodes;
        existingEdges = Array.isArray(bodyEdges) ? bodyEdges : [];
      } else if (context && Array.isArray(context.nodes) && context.nodes.length > 0) {
        existingNodes = context.nodes;
        existingEdges = Array.isArray(context.edges) ? context.edges : [];
      } else {
        existingNodes = [
          {
            id: "root-node-1",
            type: "user_input",
            label: userName,
            subtitle: "Registered Customer Account",
            isRoot: true,
            position: { x: 420, y: 70 },
            data: { name: userName, description: `Primary customer context for ${userName}` },
          },
        ];
        existingEdges = [];
      }

      const cleanNodeId = decodeURIComponent(String(nodeId || "")).trim();
      const nodeToDelete = existingNodes.find((n) => n.id === cleanNodeId || n.id === nodeId);
      const rootCount = existingNodes.filter((n) => n.isRoot || n.type === "user_input").length;

      // Only protect if it's the solitary root node
      if (nodeToDelete && (nodeToDelete.isRoot || nodeToDelete.type === "user_input") && rootCount <= 1) {
        return res.status(400).json({
          success: false,
          message: "Cannot delete the primary START node. At least one start node is required.",
        });
      }

      // Find incoming parents and outgoing children of the deleted node
      const parentEdges = existingEdges.filter((e) => e.target === cleanNodeId || e.target === nodeId);
      const childEdges = existingEdges.filter((e) => e.source === cleanNodeId || e.source === nodeId);

      // Create bridge edges reconnecting parents directly to children
      const bridgeEdges = [];
      parentEdges.forEach((pe) => {
        childEdges.forEach((ce) => {
          if (pe.source !== ce.target) {
            bridgeEdges.push({
              id: `edge-${pe.source}-${ce.target}`,
              source: pe.source,
              target: ce.target,
              sourceHandle: "right",
              targetHandle: "left",
              label: "",
            });
          }
        });
      });

      // Filter out node and direct connected edges, then append bridge edges
      const remainingEdges = existingEdges
        .filter((e) => e.source !== cleanNodeId && e.target !== cleanNodeId && e.source !== nodeId && e.target !== nodeId)
        .concat(bridgeEdges);

      // Deduplicate edges
      const edgeSet = new Set();
      const cleanEdges = [];
      for (const e of remainingEdges) {
        if (!e?.source || !e?.target) continue;
        const key = `${e.source}->${e.target}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          cleanEdges.push({
            id: String(e.id || `edge-${e.source}-${e.target}`),
            source: String(e.source),
            target: String(e.target),
            sourceHandle: String(e.sourceHandle || "right"),
            targetHandle: String(e.targetHandle || "left"),
            label: String(e.label || ""),
          });
        }
      }

      let remainingNodes = existingNodes.filter((n) => n.id !== cleanNodeId && n.id !== nodeId);
      if (remainingNodes.length === 0) {
        remainingNodes = [
          {
            id: "root-node-1",
            type: "user_input",
            label: userName,
            subtitle: "Registered Customer Account",
            isRoot: true,
            position: { x: 420, y: 70 },
            data: { name: userName, description: `Primary customer context for ${userName}` },
          },
        ];
      }

      // Re-synchronize lineage for child nodes
      const nodeMap = new Map();
      remainingNodes.forEach((n) => nodeMap.set(n.id, n));

      const workflowName = context?.name || `${userName}'s Marketing Context`;
      const enrichedNodes = remainingNodes
        .map((n) => {
          const incomingEdge = cleanEdges.find((e) => e.target === n.id);
          const parent = incomingEdge ? nodeMap.get(incomingEdge.source) : null;
          return sanitizeNode(n, parent, userName, workflowName);
        })
        .filter(Boolean);

      const computedFlows = computeWorkflowFlows(enrichedNodes, cleanEdges, workflowName);

      const updated = await AiContext.findOneAndUpdate(
        { userId },
        {
          $set: {
            userId,
            name: workflowName,
            nodes: enrichedNodes,
            edges: cleanEdges,
            flows: computedFlows,
          },
        },
        { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
      ).lean();

      return res.status(200).json({
        success: true,
        message: nodeToDelete ? `Node "${nodeToDelete.label}" deleted from database.` : "Node deleted.",
        data: {
          nodeId: cleanNodeId,
          nodes: updated?.nodes || enrichedNodes,
          edges: updated?.edges || cleanEdges,
          flows: updated?.flows || computedFlows,
        },
      });
    } catch (error) {
      console.error("[Delete Node Error]:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to delete node",
        error: error.message,
      });
    }
  }

  /**
   * Helper to parse CSV string into headers and normalized row objects
   */
  static parseCSVText(csvText) {
    if (!csvText || typeof csvText !== "string") return { headers: [], rows: [] };
    const lines = [];
    let row = [];
    let inQuotes = false;
    let field = "";

    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i];
      const nextChar = csvText[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        row.push(field.trim());
        field = "";
      } else if ((char === "\r" || char === "\n") && !inQuotes) {
        if (char === "\r" && nextChar === "\n") {
          i++;
        }
        row.push(field.trim());
        if (row.some((f) => f.length > 0)) {
          lines.push(row);
        }
        row = [];
        field = "";
      } else {
        field += char;
      }
    }

    if (field.length > 0 || row.length > 0) {
      row.push(field.trim());
      if (row.some((f) => f.length > 0)) {
        lines.push(row);
      }
    }

    if (lines.length === 0) return { headers: [], rows: [] };

    const rawHeaders = lines[0].map((h) => h.trim());
    const headers = rawHeaders.filter(Boolean);

    const rows = [];
    for (let r = 1; r < lines.length; r++) {
      const line = lines[r];
      const rowObj = {};
      let hasData = false;

      rawHeaders.forEach((header, idx) => {
        if (!header) return;
        const val = line[idx] !== undefined ? line[idx] : "";
        if (val !== "") hasData = true;

        const cleanKey = header
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "");
        rowObj[cleanKey || header] = val;
        rowObj[header] = val;
      });

      if (hasData) {
        rows.push(rowObj);
      }
    }

    return { headers, rows };
  }

  /**
   * Connect and live-fetch campaign rows directly from a Google Sheet / Cloud Excel URL
   * POST /api/ai-context/connect-sheet
   */
  static async connectSheet(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      const { sheetUrl, nodeId, worksheetName } = req.body;

      if (!sheetUrl || typeof sheetUrl !== "string" || !sheetUrl.trim()) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid Google Sheet or Excel URL link.",
        });
      }

      const cleanUrl = sheetUrl.trim();
      let detectedProvider = "Google Sheets";
      if (cleanUrl.includes("sharepoint.com") || cleanUrl.includes("1drv.ms") || cleanUrl.includes("onedrive.live.com")) {
        detectedProvider = "OneDrive";
      } else if (cleanUrl.includes("office.com") || cleanUrl.includes("excel.live.com")) {
        detectedProvider = "Microsoft 365";
      }

      let ingestionResult = null;
      try {
        ingestionResult = await SpreadsheetIngestionService.ingest({
          sheetUrlOrId: cleanUrl,
          worksheetName,
        });
      } catch (fetchErr) {
        console.error("[connectSheet Error]:", fetchErr.message);
        if (fetchErr.response?.status === 401 || fetchErr.response?.status === 403 || fetchErr.response?.status === 302) {
          return res.status(403).json({
            success: false,
            message: "Google Sheet link is private. Please connect your Google Account in the Google Drive tab or set Sheet sharing to 'Anyone with the link can view'.",
            error: "PERMISSION_DENIED",
          });
        }
        return res.status(400).json({
          success: false,
          message: `Unable to access Sheet URL (${fetchErr.message || "Request failed"}). Please ensure link sharing is set to 'Anyone with the link can view' or connect your Google Account via OAuth.`,
          error: fetchErr.message,
        });
      }

      const mapped = MetaAdsMapper.mapAndValidate(ingestionResult);
      const headers = ingestionResult.headers || [];
      const rows = ingestionResult.rows || [];
      const sheetId = ingestionResult.sourceIdentifier || "";

      // Update MongoDB AiContext if userId exists
      if (userId) {
        const context = await AiContext.findOne({ userId });
        if (context) {
          let modified = false;
          context.nodes.forEach((node) => {
            if (node.type === "data_warehouse" && (!nodeId || node.id === nodeId)) {
              const previousTracked = (node.data?.sheetUrl === cleanUrl && node.data?.sheetMetadata?.trackedRows) ? node.data.sheetMetadata.trackedRows : [];
              const rawRowObjects = rows.map((r) => ({
                ...(r.values || {}),
                _originalRowNumber: r.originalRowNumber,
                isPopulated: r.isPopulated,
                _isBlank: r._isBlank,
              }));
              const diffInit = SpreadsheetSyncService.diffSpreadsheetRows(previousTracked, rawRowObjects, headers);
              diffInit.trackedRows.forEach((tr, i) => {
                if (rows[i]) tr.cachedValues = { ...(rows[i].values || rows[i]) };
              });

              const lastRowNumber = ingestionResult.lastRowNumber || diffInit.lastRowNumber || (rows.length > 0 ? rows[rows.length - 1].originalRowNumber : 1);
              const totalSheetRows = ingestionResult.totalSheetRows || diffInit.totalSheetRows || (rows.length + 1);
              const totalDataRows = ingestionResult.totalDataRows || diffInit.totalDataRows || rows.filter((r) => r.isPopulated).length;
              const headerRowNumber = ingestionResult.headerRowNumber || diffInit.headerRowNumber || 1;

              node.data = {
                ...node.data,
                sheetUrl: cleanUrl,
                excelProvider: detectedProvider,
                workbookName: ingestionResult.spreadsheetName,
                worksheetName: ingestionResult.worksheetName,
                availableWorksheets: ingestionResult.availableWorksheets,
                excelSyncStatus: "SYNCED",
                lastSyncedAt: new Date(),
                totalRows: rows.length,
                totalDataRows,
                totalSheetRows,
                lastRowNumber,
                headerRowNumber,
                dataRowStart: headerRowNumber + 1,
                eligibleAdRowsCount: diffInit.eligibleAdRowsCount,
                validationErrorRowsCount: diffInit.validationErrorRowsCount,
                readyRowsCount: diffInit.eligibleAdRowsCount,
                correctionRequiredRowsCount: diffInit.validationErrorRowsCount,
                sheetColumns: headers,
                sheetRows: rows.map((r) => r.values),
                mappedHierarchy: mapped.groupedCampaigns,
                warnings: ingestionResult.warnings,
                sheetMetadata: {
                  ...(node.data?.sheetMetadata || {}),
                  trackedRows: diffInit.trackedRows,
                  lastSyncDiff: {
                    totalSheetRows,
                    totalDataRows,
                    lastRowNumber,
                    headerRowNumber,
                    eligibleAdRowsCount: diffInit.eligibleAdRowsCount,
                    validationErrorRowsCount: diffInit.validationErrorRowsCount,
                    newRowsCount: diffInit.newRowsCount,
                    updatedRowsCount: diffInit.updatedRowsCount,
                    unchangedRowsCount: diffInit.unchangedRowsCount,
                    blankRowsCount: diffInit.blankRowsCount,
                    newRowNumbers: diffInit.newRowNumbers,
                    updatedRowNumbers: diffInit.updatedRowNumbers,
                    validationErrorRowNumbers: diffInit.validationErrorRowNumbers,
                    eligibleAdRowNumbers: diffInit.eligibleAdRowNumbers,
                    blankRowNumbers: diffInit.blankRowNumbers,
                    syncedAt: new Date().toISOString(),
                    trigger: "connect",
                  },
                },
              };
              node.subtitle = `🔗 ${cleanUrl.slice(0, 36)}... (${totalDataRows} data rows, through Row #${lastRowNumber})`;
              modified = true;
            }
          });

          if (modified) {
            context.markModified("nodes");
            await context.save();
          }
        }
      }

      const lastRowNumber = ingestionResult.lastRowNumber || (rows.length > 0 ? rows[rows.length - 1].originalRowNumber : 1);
      const totalSheetRows = ingestionResult.totalSheetRows || (rows.length + 1);
      const totalDataRows = ingestionResult.totalDataRows || rows.filter((r) => r.isPopulated).length;
      const headerRowNumber = ingestionResult.headerRowNumber || 1;

      return res.status(200).json({
        success: true,
        message: `Successfully connected to sheet! Sheet data through Row #${lastRowNumber} (${totalSheetRows} total rows with data). Discovered ${totalDataRows} data rows (${mapped.readyRowsCount} eligible for ads, ${mapped.correctionRequiredRowsCount} require correction).`,
        data: {
          sheetUrl: cleanUrl,
          provider: detectedProvider,
          sheetId,
          spreadsheetName: ingestionResult.spreadsheetName,
          worksheetName: ingestionResult.worksheetName,
          availableWorksheets: ingestionResult.availableWorksheets,
          totalRows: rows.length,
          totalDataRows,
          totalSheetRows,
          lastRowNumber,
          headerRowNumber,
          dataRowStart: headerRowNumber + 1,
          columns: headers,
          readyRowsCount: mapped.readyRowsCount,
          correctionRequiredRowsCount: mapped.correctionRequiredRowsCount,
          eligibleAdRowsCount: mapped.readyRowsCount,
          validationErrorRowsCount: mapped.correctionRequiredRowsCount,
          newRowsCount: rows.length,
          updatedRowsCount: 0,
          blankRowsCount: ingestionResult.blankRowsCount || 0,
          groupedCampaigns: mapped.groupedCampaigns,
          warnings: ingestionResult.warnings,
          sampleRows: rows.slice(0, 5).map((r) => r.values),
          lastSyncedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error("[AiContextController.connectSheet Fatal]:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to connect to sheet.",
        error: err.message,
      });
    }
  }

  /**
   * Manually trigger immediate spreadsheet sync and return diff
   * POST /api/ai-context/sync-sheet
   */
  static async syncSheet(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      const { sheetUrl, worksheetName } = req.body || {};

      const result = await SpreadsheetSyncService.syncSpreadsheet({
        userId,
        sheetUrlOrId: sheetUrl,
        worksheetName,
        trigger: "manual",
      });

      if (!result.success) {
        return res.status(result.inProgress ? 409 : 400).json({
          success: false,
          message: result.message || result.error || "Failed to sync spreadsheet",
          data: result,
        });
      }

      return res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (err) {
      console.error("[AiContextController.syncSheet Error]:", err);
      return res.status(500).json({
        success: false,
        message: "Internal error syncing spreadsheet",
        error: err.message,
      });
    }
  }

  /**
   * Get current spreadsheet sync status and stats
   * GET /api/ai-context/sheet-sync-status
   */
  static async getSheetSyncStatus(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      const context = await AiContext.findOne({ userId }).lean();
      const warehouseNode = (context?.nodes || []).find((n) => n.type === "data_warehouse");

      if (!warehouseNode) {
        return res.status(200).json({
          success: true,
          data: {
            connected: false,
            syncStatus: "NOT_CONNECTED",
            message: "No spreadsheet connected",
          },
        });
      }

      const meta = warehouseNode.data?.sheetMetadata || {};
      const lastDiff = meta.lastSyncDiff || {};

      return res.status(200).json({
        success: true,
        data: {
          connected: Boolean(warehouseNode.data?.sheetUrl),
          sheetUrl: warehouseNode.data?.sheetUrl || "",
          spreadsheetName: warehouseNode.data?.workbookName || "Google Spreadsheet",
          worksheetName: warehouseNode.data?.worksheetName || "Sheet1",
          availableWorksheets: warehouseNode.data?.availableWorksheets || [],
          syncStatus: warehouseNode.data?.excelSyncStatus || "IDLE",
          lastSyncedAt: warehouseNode.data?.lastSyncedAt || null,
          totalRows: warehouseNode.data?.totalRows || 0,
          newRowsCount: lastDiff.newRowsCount || 0,
          updatedRowsCount: lastDiff.updatedRowsCount || 0,
          unchangedRowsCount: lastDiff.unchangedRowsCount || 0,
          newRowNumbers: lastDiff.newRowNumbers || [],
          updatedRowNumbers: lastDiff.updatedRowNumbers || [],
          lastSyncError: meta.lastSyncError || null,
        },
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch sync status",
        error: err.message,
      });
    }
  }

  /**
   * Ingest uploaded Excel file (.xlsx / .xls)
   * POST /api/ai-context/upload-excel
   */
  /**
   * Ingest uploaded Excel file (.xlsx / .xls)
   * POST /api/ai-context/upload-excel
   */
  static async uploadExcel(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      const file = req.file;
      const { worksheetName, nodeId } = req.body;

      if (!file || !file.buffer) {
        return res.status(400).json({
          success: false,
          message: "Please select an Excel file (.xlsx or .xls) to upload.",
        });
      }

      const ingestionResult = await SpreadsheetIngestionService.ingest({
        fileBuffer: file.buffer,
        originalFilename: file.originalname,
        worksheetName,
      });

      const mapped = MetaAdsMapper.mapAndValidate(ingestionResult);
      const headers = ingestionResult.headers || [];
      const rows = ingestionResult.rows || [];

      if (userId) {
        let context = await AiContext.findOne({ userId });
        if (!context) {
          context = new AiContext({
            userId,
            name: "Primary Marketing Context",
            nodes: [],
            edges: [],
            flows: [],
          });
        }

        let modified = false;
        let warehouseFound = false;

        context.nodes.forEach((node) => {
          if (node.type === "data_warehouse" && (!nodeId || node.id === nodeId)) {
            warehouseFound = true;
            node.data = {
              ...node.data,
              excelProvider: "Excel File Upload",
              workbookName: ingestionResult.spreadsheetName,
              worksheetName: ingestionResult.worksheetName,
              availableWorksheets: ingestionResult.availableWorksheets,
              excelSyncStatus: "UPLOADED",
              lastSyncedAt: new Date(),
              totalRows: rows.length,
              readyRowsCount: mapped.readyRowsCount,
              correctionRequiredRowsCount: mapped.correctionRequiredRowsCount,
              sheetColumns: headers,
              sheetRows: rows.map((r) => ({
                ...(r.values || r),
                _originalRowNumber: r.originalRowNumber,
                originalRowNumber: r.originalRowNumber,
              })),
              mappedHierarchy: mapped.groupedCampaigns,
              warnings: ingestionResult.warnings,
            };
            node.subtitle = `📁 ${file.originalname} (${rows.length} rows)`;
            modified = true;
          }
        });

        if (!warehouseFound) {
          const newWarehouseNode = {
            id: `warehouse-${Date.now()}`,
            type: "data_warehouse",
            label: "Attached Excel File",
            subtitle: `📁 ${file.originalname} (${rows.length} rows)`,
            contextTag: context.name || "Primary Marketing Context",
            position: { x: 800, y: 200 },
            data: {
              name: file.originalname,
              description: `Uploaded Excel File: ${file.originalname}`,
              excelProvider: "Excel File Upload",
              workbookName: ingestionResult.spreadsheetName,
              worksheetName: ingestionResult.worksheetName,
              availableWorksheets: ingestionResult.availableWorksheets,
              excelSyncStatus: "UPLOADED",
              lastSyncedAt: new Date(),
              totalRows: rows.length,
              readyRowsCount: mapped.readyRowsCount,
              correctionRequiredRowsCount: mapped.correctionRequiredRowsCount,
              sheetColumns: headers,
              sheetRows: rows.map((r) => ({
                ...(r.values || r),
                _originalRowNumber: r.originalRowNumber,
                originalRowNumber: r.originalRowNumber,
              })),
              mappedHierarchy: mapped.groupedCampaigns,
              warnings: ingestionResult.warnings,
            },
          };
          context.nodes.push(newWarehouseNode);
          modified = true;
        }

        if (modified) {
          context.markModified("nodes");
          await context.save();
        }
      }

      return res.status(200).json({
        success: true,
        message: `Successfully parsed Excel file "${file.originalname}"! Found ${rows.length} populated rows and ${headers.length} columns (${mapped.readyRowsCount} ready, ${mapped.correctionRequiredRowsCount} require correction).`,
        data: {
          spreadsheetName: ingestionResult.spreadsheetName,
          worksheetName: ingestionResult.worksheetName,
          availableWorksheets: ingestionResult.availableWorksheets,
          totalRows: rows.length,
          columns: headers,
          readyRowsCount: mapped.readyRowsCount,
          correctionRequiredRowsCount: mapped.correctionRequiredRowsCount,
          groupedCampaigns: mapped.groupedCampaigns,
          warnings: ingestionResult.warnings,
          sampleRows: rows.slice(0, 5).map((r) => r.values),
          lastSyncedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error("[AiContextController.uploadExcel Fatal]:", err);
      return res.status(500).json({
        success: false,
        message: `Failed to process uploaded Excel file: ${err.message}`,
        error: err.message,
      });
    }
  }

  /**
   * Preview Meta Ads pipeline mapping & structural validation
   * POST /api/ai-context/preview-pipeline
   */
  static async previewPipeline(req, res) {
    try {
      const { sheetUrlOrId, worksheetName } = req.body;
      const ingestionResult = await SpreadsheetIngestionService.ingest({
        sheetUrlOrId,
        worksheetName,
      });

      const mapping = MetaAdsMapper.mapAndValidate(ingestionResult);

      return res.status(200).json({
        success: true,
        data: {
          spreadsheetName: ingestionResult.spreadsheetName,
          worksheetName: ingestionResult.worksheetName,
          availableWorksheets: ingestionResult.availableWorksheets,
          headers: ingestionResult.headers,
          totalRows: mapping.totalRows,
          readyRowsCount: mapping.readyRowsCount,
          correctionRequiredRowsCount: mapping.correctionRequiredRowsCount,
          ambiguousHeaders: mapping.ambiguousHeaders,
          groupedCampaigns: mapping.groupedCampaigns,
          validationErrors: mapping.validationErrors,
          warnings: ingestionResult.warnings,
          requiresConfirmation: true,
        },
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate pipeline preview",
        error: err.message,
      });
    }
  }

  /**
   * Get latest stored sheet rows for agent or frontend preview
   * GET /api/ai-context/sheet-rows
   */
  static async getSheetRows(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      const context = await AiContext.findOne({ userId }).lean();
      const warehouseNodes = (context?.nodes || []).filter(
        (n) => n.type === "data_warehouse" && (n.data?.sheetUrl || (Array.isArray(n.data?.sheetRows) && n.data.sheetRows.length > 0))
      );

      warehouseNodes.sort((a, b) => {
        const timeA = new Date(a.data?.lastSyncedAt || a.updatedAt || 0).getTime();
        const timeB = new Date(b.data?.lastSyncedAt || b.updatedAt || 0).getTime();
        return timeB - timeA;
      });

      const warehouseNode = warehouseNodes.length > 0 ? warehouseNodes[0] : null;

      const rows = warehouseNode?.data?.sheetRows || [];
      const columns = warehouseNode?.data?.sheetColumns || [];

      return res.status(200).json({
        success: true,
        data: {
          sheetUrl: warehouseNode?.data?.sheetUrl || "",
          provider: warehouseNode?.data?.excelProvider || "Google Sheets",
          workbookName: warehouseNode?.data?.workbookName || "Campaign Workbook",
          worksheetName: warehouseNode?.data?.worksheetName || "Sheet1",
          availableWorksheets: warehouseNode?.data?.availableWorksheets || [],
          totalRows: rows.length,
          readyRowsCount: warehouseNode?.data?.readyRowsCount || rows.length,
          correctionRequiredRowsCount: warehouseNode?.data?.correctionRequiredRowsCount || 0,
          columns,
          rows,
          groupedCampaigns: warehouseNode?.data?.mappedHierarchy || [],
          lastSyncedAt: warehouseNode?.data?.lastSyncedAt || null,
        },
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Failed to get sheet rows",
        error: err.message,
      });
    }
  }

  /**
   * Connect or update Google Drive settings for warehouse node
   * POST /api/ai-context/connect-drive
   */
  static async connectGoogleDrive(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      const { email, folderUrl, folderId, nodeId } = req.body;

      let extractedId = folderId || "";
      let validationMsg = "Google Drive configuration saved.";

      if (folderUrl && folderUrl.trim()) {
        const check = await googleDriveService.validateDriveLink(folderUrl.trim());
        if (!check.valid) {
          return res.status(400).json({
            success: false,
            message: check.message || "Invalid Google Drive folder link.",
          });
        }
        extractedId = check.fileId || extractedId;
        validationMsg = check.message;
      }

      if (userId) {
        const context = await AiContext.findOne({ userId });
        if (context) {
          let modified = false;
          context.nodes = context.nodes.map((n) => {
            if (n.type === "data_warehouse" && (!nodeId || n.id === nodeId)) {
              modified = true;
              return {
                ...n,
                data: {
                  ...n.data,
                  googleDriveConnected: true,
                  googleDriveEmail: email ? email.trim() : n.data?.googleDriveEmail || "Connected Drive User",
                  googleDriveFolderId: extractedId,
                  googleDriveFolderName: folderUrl ? folderUrl.trim() : n.data?.googleDriveFolderName || "",
                },
              };
            }
            return n;
          });

          if (modified) {
            context.markModified("nodes");
            await context.save();
          }
        }
      }

      return res.status(200).json({
        success: true,
        message: `Google Drive connected successfully! ${validationMsg}`,
        data: {
          googleDriveConnected: true,
          googleDriveEmail: email || "Connected Drive User",
          googleDriveFolderId: extractedId,
          googleDriveFolderName: folderUrl || "",
        },
      });
    } catch (err) {
      console.error("[Connect Google Drive Error]:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to connect Google Drive",
        error: err.message,
      });
    }
  }

  /**
   * Test / Validate a specific Google Drive asset link (image or video)
   * POST /api/ai-context/test-drive-link
   */
  static async testDriveLink(req, res) {
    try {
      const { driveUrl } = req.body;
      if (!driveUrl || !driveUrl.trim()) {
        return res.status(400).json({
          success: false,
          message: "Please provide a Google Drive file or folder URL to test.",
        });
      }

      const check = await googleDriveService.validateDriveLink(driveUrl.trim());
      return res.status(200).json({
        success: check.valid,
        message: check.message,
        data: {
          fileId: check.fileId,
        },
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Failed to validate Google Drive link",
        error: err.message,
      });
    }
  }
}
