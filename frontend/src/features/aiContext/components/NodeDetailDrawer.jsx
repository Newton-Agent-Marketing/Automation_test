import { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import {
  X,
  Trash2,
  Settings2,
  Building2,
  Megaphone,
  FileText,
  Package,
  Database,
  User,
  Mail,
  Check,
  Globe,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Search,
  Plus,
  Calendar,
  ListPlus,
  ShoppingBag,
  Tag,
  UploadCloud,
  RefreshCw,
  FileSpreadsheet,
  HardDrive,
  Link2,
  ShieldCheck,
  Download,
  Folder,
  FolderOpen,
  File,
  Key,
  Copy,
  LogOut,
  Code,
  ChevronDown,
  ChevronUp,
  Layers,
  Sparkles,
  Play,
  Eye,
} from "lucide-react";
import { NODE_TYPE_INFO } from "../aiContext.slice";
import { channelApi } from "../../channel/service/channel.api";
import { aiContextApi } from "../service/aiContext.api";

const TYPE_ICONS = {
  user_input: User,
  business_unit: Building2,
  ad_channel: Megaphone,
  marketing_brief: FileText,
  product: Package,
  data_warehouse: Database,
};

export const NodeDetailDrawer = ({
  node,
  onSave,
  onDelete,
  onClose,
}) => {
  // Common & Lineage fields
  const prevNodeIdRef = useRef(null);
  const [contextTag, setContextTag] = useState("");
  const [savedBadge, setSavedBadge] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Business Unit Fields
  const [buName, setBuName] = useState("");
  const [buDescription, setBuDescription] = useState("");

  // Ad Channel Fields
  const [channelName, setChannelName] = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [funnelEvent, setFunnelEvent] = useState("Purchase");
  const [funnelDescription, setFunnelDescription] = useState("");
  const [connectedAccounts, setConnectedAccounts] = useState([]);
  const [loadingChannels, setLoadingChannels] = useState(false);

  // Marketing Brief Fields
  const [briefName, setBriefName] = useState("");
  const [briefDescription, setBriefDescription] = useState("");
  const [briefStartDate, setBriefStartDate] = useState("");
  const [briefEndDate, setBriefEndDate] = useState("");
  const [briefMetrics, setBriefMetrics] = useState("");
  const [metricsList, setMetricsList] = useState([]);

  const unpackConcatenatedMetrics = (text) => {
    if (!text || typeof text !== "string") return [];
    const res = [];
    const regex = /\[([^\]]+)\]:\s*([^|]+)/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const period = match[1].trim();
      const val = match[2].trim();
      let sDate = "";
      let eDate = "";
      if (period.includes(" to ")) {
        const parts = period.split(" to ");
        sDate = parts[0]?.trim() || "";
        eDate = parts[1]?.trim() || "";
      } else {
        sDate = period;
      }
      res.push({
        id: `m_${Date.now()}_${res.length}`,
        startDate: sDate,
        endDate: eDate,
        formattedPeriod: period,
        metrics: val,
      });
    }
    return res;
  };

  const getBriefFormattedPeriod = () => {
    if (briefStartDate && briefEndDate) {
      return `${briefStartDate} to ${briefEndDate}`;
    }
    return briefStartDate || briefEndDate || "";
  };

  const handleAddMetricsRange = () => {
    if (!briefMetrics.trim() && !briefStartDate && !briefEndDate) return;
    const period = getBriefFormattedPeriod();
    const newEntry = {
      id: `m_${Date.now()}_${metricsList.length}`,
      startDate: briefStartDate,
      endDate: briefEndDate,
      formattedPeriod: period,
      metrics: briefMetrics.trim(),
    };
    setMetricsList((prev) => [...prev, newEntry]);
    setBriefMetrics("");
    setBriefStartDate("");
    setBriefEndDate("");
  };

  const handleRemoveMetricsRange = (id) => {
    setMetricsList((prev) => prev.filter((item) => item.id !== id));
  };

  // Product Fields & 100+ Catalog state
  const [productName, setProductName] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [isAppSelected, setIsAppSelected] = useState(false);
  const [isWebSelected, setIsWebSelected] = useState(true);
  const [productsList, setProductsList] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [newProdName, setNewProdName] = useState("");
  const [newProdPrice, setNewProdPrice] = useState("");
  const [newProdSku, setNewProdSku] = useState("");
  const [newProdCategory, setNewProdCategory] = useState("");
  const [newProdUrl, setNewProdUrl] = useState("");

  // Data Warehouse Fields (Excel Sheet = WHAT, Google Drive = MEDIA)
  const [warehouseTab, setWarehouseTab] = useState("excel");
  const [sheetUrl, setSheetUrl] = useState("");
  const [excelProvider, setExcelProvider] = useState("Google Sheets");
  const [workbookName, setWorkbookName] = useState("");
  const [worksheetName, setWorksheetName] = useState("");
  const [excelSyncStatus, setExcelSyncStatus] = useState("NOT_CONNECTED");
  const [googleDriveConnected, setGoogleDriveConnected] = useState(true);
  const [googleDriveEmail, setGoogleDriveEmail] = useState("");
  const [googleDriveFolder, setGoogleDriveFolder] = useState("");
  const [dataLabels, setDataLabels] = useState("");
  const [warehousePlatform, setWarehousePlatform] = useState("Excel Sheet & Google Drive");
  
  // Multi-Sheet Warehouse States (up to 10 sheets)
  const [sheetsList, setSheetsList] = useState([]);

  const handleAddSheet = () => {
    if (sheetsList.length >= 10) return;
    const newSheet = {
      id: `sheet_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      sheetUrl: "",
      excelProvider: "Google Sheets",
      workbookName: "",
      worksheetName: "Sheet1",
      excelSyncStatus: "NOT_CONNECTED",
      dataLabels: "",
      totalRows: 0,
      totalDataRows: 0,
      totalSheetRows: 0,
      sheetColumns: [],
      lastSyncedAt: null,
      connectMsg: "",
      connectError: "",
      isConnecting: false,
    };
    setSheetsList((prev) => [...prev, newSheet]);
  };

  const handleRemoveSheet = async (sheetId) => {
    // 1. Delete ONLY the exact sheet that the user requested to remove
    const remainingSheets = sheetsList.filter(
      (s, idx) => String(s.id) !== String(sheetId) && idx !== sheetId && String(idx) !== String(sheetId)
    );

    const finalSheets = remainingSheets.length === 0
      ? [
          {
            id: `sheet_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            sheetUrl: "",
            excelProvider: "Google Sheets",
            workbookName: "",
            worksheetName: "Sheet1",
            excelSyncStatus: "NOT_CONNECTED",
            dataLabels: "",
            totalRows: 0,
            totalDataRows: 0,
            totalSheetRows: 0,
            sheetColumns: [],
            lastSyncedAt: null,
            connectMsg: "",
            connectError: "",
            isConnecting: false,
          },
        ]
      : remainingSheets;

    // Immediately update drawer state so the user sees only the target sheet deleted
    setSheetsList(finalSheets);

    // 2. Prepare ALL remaining sheets to persist into Redux & MongoDB (preserve all other cards)
    const sheetsToPersist = finalSheets.map((s, idx) => ({
      id: String(s.id || `sheet_${idx}_${Date.now()}`),
      sheetUrl: (s.sheetUrl || "").trim(),
      excelProvider: s.excelProvider || "Google Sheets",
      workbookName: (s.workbookName || "").trim(),
      worksheetName: (s.worksheetName || "Sheet1").trim(),
      availableTabs: Array.isArray(s.availableTabs) ? s.availableTabs : [],
      selectedTabIds: Array.isArray(s.selectedTabIds) ? s.selectedTabIds : [],
      selectedTabsData: Array.isArray(s.selectedTabsData) ? s.selectedTabsData : [],
      excelSyncStatus: s.excelSyncStatus || (s.sheetUrl ? "SYNCED" : "NOT_CONNECTED"),
      totalRows: Number(s.totalRows || 0),
      totalDataRows: Number(s.totalDataRows || s.totalRows || 0),
      totalSheetRows: Number(s.totalSheetRows || (s.totalRows ? s.totalRows + 1 : 0)),
      sheetColumns: Array.isArray(s.sheetColumns) ? s.sheetColumns : [],
      dataLabels: (s.dataLabels || "").trim(),
      dataLevel: (s.dataLabels || "").trim(),
      lastSyncedAt: s.lastSyncedAt || null,
    }));

    const connectedSheets = sheetsToPersist.filter((s) => Boolean(s.sheetUrl));
    const primaryConnected = connectedSheets[0] || null;
    const totalConnected = connectedSheets.length;

    let nodeLabel = "Excel & Drive Warehouse";
    if (totalConnected > 1) {
      nodeLabel = `Warehouse (${totalConnected} Sheets)`;
    } else if (totalConnected === 1 && primaryConnected) {
      nodeLabel = primaryConnected.workbookName || (primaryConnected.sheetUrl ? "Connected Google Sheet" : "Excel & Drive Warehouse");
      if (primaryConnected.excelProvider) {
        nodeLabel = `${nodeLabel} (${primaryConnected.excelProvider})`;
      }
    }

    let nodeSubtitle = "Drive: Linked";
    if (totalConnected > 1) {
      nodeSubtitle = `📊 ${totalConnected} Sheets Connected`;
    } else if (totalConnected === 1 && primaryConnected) {
      nodeSubtitle = primaryConnected.sheetUrl ? `🔗 ${primaryConnected.sheetUrl.slice(0, 38)}...` : `Drive: ${googleDriveEmail ? "Connected" : "Linked"}`;
    }

    const dataPayload = {
      ...(node?.data || {}),
      warehouseSource: "both",
      sheetUrl: primaryConnected ? primaryConnected.sheetUrl : "",
      excelProvider: primaryConnected ? primaryConnected.excelProvider : "Google Sheets",
      workbookName: primaryConnected ? primaryConnected.workbookName : "",
      worksheetName: primaryConnected ? primaryConnected.worksheetName : "Sheet1",
      excelSyncStatus: primaryConnected ? primaryConnected.excelSyncStatus : "NOT_CONNECTED",
      totalRows: primaryConnected ? Number(primaryConnected.totalRows || 0) : 0,
      totalDataRows: primaryConnected ? Number(primaryConnected.totalDataRows || 0) : 0,
      dataLevel: primaryConnected ? primaryConnected.dataLabels : "",
      dataLabels: primaryConnected ? primaryConnected.dataLabels : "",
      databasePlatform: "Excel Sheet & Google Drive",
      sheets: sheetsToPersist,
    };

    try {
      if (typeof onSave === "function") {
        await onSave(node.id, {
          label: nodeLabel,
          subtitle: nodeSubtitle,
          contextTag: contextTag?.trim() || node.contextTag || "Primary Marketing Context",
          data: dataPayload,
        });
      }
    } catch (err) {
      console.warn("[NodeDetailDrawer] Error auto-saving deleted sheet to DB:", err);
    }
  };

  const handleUpdateSheetField = (sheetId, fields) => {
    setSheetsList((prev) =>
      prev.map((s) => (s.id === sheetId ? { ...s, ...fields } : s))
    );
  };

  const handleSheetUrlChangeForIndex = (sheetId, url) => {
    let provider = "Google Sheets";
    let wb = "";
    let ws = "Sheet1";

    const gMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (gMatch) {
      provider = "Google Sheets";
      wb = `Google_Sheet_${gMatch[1].slice(0, 8)}`;
      const gidMatch = url.match(/gid=(\d+)/);
      if (gidMatch) ws = `Tab_gid_${gidMatch[1]}`;
    } else if (url.includes("sharepoint.com") || url.includes("1drv.ms") || url.includes("onedrive.live.com")) {
      provider = "OneDrive";
      wb = "OneDrive_Campaign_Workbook.xlsx";
    } else if (url.includes("office.com") || url.includes("excel.live.com")) {
      provider = "Microsoft 365";
      wb = "M365_Campaign_Workbook.xlsx";
    }

    setSheetsList((prev) =>
      prev.map((s) => {
        if (s.id !== sheetId) return s;
        return {
          ...s,
          sheetUrl: url,
          excelProvider: provider,
          workbookName: s.workbookName || wb,
          worksheetName: s.worksheetName || ws,
          excelSyncStatus: !url.trim() ? "NOT_CONNECTED" : s.excelSyncStatus,
          connectError: "",
          connectMsg: "",
        };
      })
    );
  };

  const handleConnectSheetAtIndex = async (sheetItem) => {
    if (!sheetItem.sheetUrl?.trim()) {
      handleUpdateSheetField(sheetItem.id, {
        connectError: "Please paste a Google Sheet or Excel URL first.",
      });
      return;
    }

    handleUpdateSheetField(sheetItem.id, {
      isConnecting: true,
      connectError: "",
      connectMsg: "",
    });

    try {
      const res = await aiContextApi.connectSheet({
        sheetUrl: sheetItem.sheetUrl.trim(),
        nodeId: node?.id,
      });

      if (res.data?.success) {
        const d = res.data.data || {};
        handleUpdateSheetField(sheetItem.id, {
          isConnecting: false,
          excelSyncStatus: "SYNCED",
          connectMsg: res.data.message || `Connected! Found ${d.totalDataRows || d.totalRows || 0} data rows across ${d.availableTabs?.length || 1} tabs.`,
          workbookName: d.spreadsheetName || sheetItem.workbookName || `Google_Sheet_${(d.sheetId || "").slice(0, 8)}`,
          worksheetName: d.worksheetName || sheetItem.worksheetName || "Sheet1",
          availableTabs: d.availableTabs || [],
          selectedTabIds: d.selectedTabIds || (d.availableTabs || []).map((t) => (t.sheetId !== undefined ? t.sheetId : t.title)),
          selectedTabsData: d.selectedTabsData || [],
          totalRows: d.totalRows || 0,
          totalDataRows: d.totalDataRows || d.totalRows || 0,
          totalSheetRows: d.totalSheetRows || ((d.totalDataRows || d.totalRows || 0) + 1),
          sheetColumns: d.columns || [],
          lastSyncedAt: d.lastSyncedAt || new Date().toISOString(),
          hasUnsavedTabChanges: false,
        });
      } else {
        handleUpdateSheetField(sheetItem.id, {
          isConnecting: false,
          excelSyncStatus: "FAILED",
          connectError: res.data?.message || "Failed to connect to sheet.",
        });
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || "Failed to connect to sheet.";
      handleUpdateSheetField(sheetItem.id, {
        isConnecting: false,
        excelSyncStatus: "FAILED",
        connectError: msg,
      });
    }
  };

  // Preview Data Modal State
  const [previewModalData, setPreviewModalData] = useState(null);

  const handleToggleTabSelection = (sheetId, tabKey) => {
    setSheetsList((prev) =>
      prev.map((s) => {
        if (s.id !== sheetId) return s;
        const currentSelected = Array.isArray(s.selectedTabIds) ? [...s.selectedTabIds] : [];
        const exists = currentSelected.some(
          (id) => String(id) === String(tabKey) || String(id).toLowerCase() === String(tabKey).toLowerCase()
        );
        let updated;
        if (exists) {
          updated = currentSelected.filter(
            (id) => String(id) !== String(tabKey) && String(id).toLowerCase() !== String(tabKey).toLowerCase()
          );
        } else {
          updated = [...currentSelected, tabKey];
        }
        return {
          ...s,
          selectedTabIds: updated,
          hasUnsavedTabChanges: true,
          saveTabsMsg: "",
        };
      })
    );
  };

  const handleSelectAllTabs = (sheetId) => {
    setSheetsList((prev) =>
      prev.map((s) => {
        if (s.id !== sheetId) return s;
        const allKeys = (s.availableTabs || []).map((t) => (t.sheetId !== undefined ? t.sheetId : t.title));
        return {
          ...s,
          selectedTabIds: allKeys,
          hasUnsavedTabChanges: true,
          saveTabsMsg: "",
        };
      })
    );
  };

  const handleDeselectAllTabs = (sheetId) => {
    setSheetsList((prev) =>
      prev.map((s) => {
        if (s.id !== sheetId) return s;
        return {
          ...s,
          selectedTabIds: [],
          hasUnsavedTabChanges: true,
          saveTabsMsg: "",
        };
      })
    );
  };

  const handleSaveTabSelection = async (sheetId) => {
    const target = sheetsList.find((s) => s.id === sheetId);
    if (!target) return;

    handleUpdateSheetField(sheetId, { isSavingTabs: true, saveTabsMsg: "" });

    try {
      const res = await aiContextApi.saveTabSelection({
        nodeId: node?.id,
        sheetId: target.id,
        sheetUrl: target.sheetUrl,
        selectedTabIds: target.selectedTabIds || [],
      });

      if (res.data?.success) {
        const d = res.data.data || {};
        handleUpdateSheetField(sheetId, {
          isSavingTabs: false,
          hasUnsavedTabChanges: false,
          saveTabsMsg: `✓ Saved! ${d.selectedTabsData?.length || 0} active tabs for AI Agent.`,
          selectedTabsData: d.selectedTabsData || target.selectedTabsData || [],
          totalRows: d.totalRows !== undefined ? d.totalRows : target.totalRows,
          totalDataRows: d.totalDataRows !== undefined ? d.totalDataRows : target.totalDataRows,
          sheetColumns: d.columns || target.sheetColumns || [],
        });
        setTimeout(() => {
          handleUpdateSheetField(sheetId, { saveTabsMsg: "" });
        }, 3000);
      } else {
        handleUpdateSheetField(sheetId, {
          isSavingTabs: false,
          connectError: res.data?.message || "Failed to save tab selection.",
        });
      }
    } catch (err) {
      handleUpdateSheetField(sheetId, {
        isSavingTabs: false,
        connectError: err.response?.data?.message || err.message || "Failed to save tab selection.",
      });
    }
  };

  const handlePreviewTab = async (sheet, tab) => {
    setPreviewModalData({
      open: true,
      title: tab.title,
      sheetId: tab.sheetId,
      isLoading: true,
      headers: [],
      rows: [],
      totalRows: 0,
      error: null,
    });

    try {
      const res = await aiContextApi.previewTabData({
        sheetUrl: sheet.sheetUrl,
        sheetTitle: tab.title,
        sheetId: tab.sheetId,
      });

      if (res.data?.success) {
        const d = res.data.data || {};
        setPreviewModalData({
          open: true,
          title: tab.title,
          sheetId: tab.sheetId,
          isLoading: false,
          headers: d.columns || [],
          rows: d.rows || [],
          totalRows: d.totalRows || (d.rows || []).length,
          error: null,
        });
      } else {
        setPreviewModalData((prev) => ({
          ...prev,
          isLoading: false,
          error: res.data?.message || "Failed to load tab preview.",
        }));
      }
    } catch (err) {
      setPreviewModalData((prev) => ({
        ...prev,
        isLoading: false,
        error: err.response?.data?.message || err.message || "Failed to load tab preview.",
      }));
    }
  };

  // Sheet Live Connect States
  const [isConnectingSheet, setIsConnectingSheet] = useState(false);
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [sheetConnectMsg, setSheetConnectMsg] = useState("");
  const [sheetConnectError, setSheetConnectError] = useState("");
  const [sheetStats, setSheetStats] = useState({
    totalRows: 0,
    totalDataRows: 0,
    totalSheetRows: 0,
    lastRowNumber: 1,
    headerRowNumber: 1,
    columns: [],
    lastSyncedAt: null,
    newRowsCount: 0,
    updatedRowsCount: 0,
    blankRowsCount: 0,
    eligibleAdRowsCount: 0,
    validationErrorRowsCount: 0,
    newRowNumbers: [],
    updatedRowNumbers: [],
  });

  const handleSheetUrlChange = (url) => {
    setSheetUrl(url);
    setSheetConnectError("");
    setSheetConnectMsg("");
    if (!url.trim()) {
      setExcelSyncStatus("NOT_CONNECTED");
      return;
    }

    // Detect Google Sheets URL
    const gMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (gMatch) {
      setExcelProvider("Google Sheets");
      const id = gMatch[1];
      if (!workbookName) setWorkbookName(`Google_Sheet_${id.slice(0, 8)}`);
      
      const gidMatch = url.match(/gid=(\d+)/);
      if (gidMatch && !worksheetName) {
        setWorksheetName(`Tab_gid_${gidMatch[1]}`);
      } else if (!worksheetName) {
        setWorksheetName("Sheet1");
      }
      return;
    }

    // Detect Microsoft 365 / OneDrive / SharePoint URL
    if (url.includes("sharepoint.com") || url.includes("1drv.ms") || url.includes("onedrive.live.com")) {
      setExcelProvider("OneDrive");
      if (!workbookName) setWorkbookName("OneDrive_Campaign_Workbook.xlsx");
      if (!worksheetName) setWorksheetName("Sheet1");
      return;
    }

    if (url.includes("office.com") || url.includes("excel.live.com")) {
      setExcelProvider("Microsoft 365");
      if (!workbookName) setWorkbookName("M365_Campaign_Workbook.xlsx");
      if (!worksheetName) setWorksheetName("Sheet1");
    }
  };

  const handleConnectSheetClick = async () => {
    if (!sheetUrl.trim()) {
      setSheetConnectError("Please paste a Google Sheet or Excel URL link first.");
      return;
    }

    try {
      setIsConnectingSheet(true);
      setSheetConnectError("");
      setSheetConnectMsg("");

      const res = await aiContextApi.connectSheet({
        sheetUrl: sheetUrl.trim(),
        nodeId: node.id,
      });

      if (res.data?.success) {
        const d = res.data.data || {};
        setExcelSyncStatus("SYNCED");
        setSheetConnectMsg(res.data.message || `Connected! Found ${d.totalDataRows || d.totalRows || 0} data rows.`);
        setSheetStats({
          totalRows: d.totalRows || 0,
          totalDataRows: d.totalDataRows || d.totalRows || 0,
          totalSheetRows: d.totalSheetRows || (d.totalDataRows ? d.totalDataRows + 1 : 0),
          lastRowNumber: d.lastRowNumber || 9,
          headerRowNumber: d.headerRowNumber || 1,
          columns: d.columns || [],
          lastSyncedAt: d.lastSyncedAt || new Date().toISOString(),
          newRowsCount: d.newRowsCount || 0,
          updatedRowsCount: d.updatedRowsCount || 0,
          blankRowsCount: d.blankRowsCount || 0,
          eligibleAdRowsCount: d.eligibleAdRowsCount ?? d.readyRowsCount ?? 0,
          validationErrorRowsCount: d.validationErrorRowsCount ?? d.correctionRequiredRowsCount ?? 0,
          newRowNumbers: d.newRowNumbers || [],
          updatedRowNumbers: d.updatedRowNumbers || [],
        });
        if (d.sheetId && !workbookName) {
          setWorkbookName(d.spreadsheetName || `Google_Sheet_${d.sheetId.slice(0, 8)}`);
        }
      } else {
        setSheetConnectError(res.data?.message || "Failed to connect to sheet.");
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || "Failed to connect to sheet.";
      setSheetConnectError(msg);
    } finally {
      setIsConnectingSheet(false);
    }
  };

  const handleSyncSheetClick = async () => {
    try {
      setIsSyncingSheet(true);
      setSheetConnectError("");
      setSheetConnectMsg("");

      const res = await aiContextApi.syncSheet({
        sheetUrl: sheetUrl.trim() || undefined,
        worksheetName: worksheetName || undefined,
      });

      if (res.data?.success) {
        const d = res.data.data || {};
        setExcelSyncStatus("SYNCED");
        setSheetConnectMsg(res.data.message || `Sync successful! ${d.totalDataRows || d.totalRows || 0} data rows.`);
        setSheetStats((prev) => ({
          ...prev,
          totalRows: d.totalRows ?? prev.totalRows,
          totalDataRows: d.totalDataRows ?? d.totalRows ?? prev.totalDataRows,
          totalSheetRows: d.totalSheetRows ?? prev.totalSheetRows,
          lastRowNumber: d.lastRowNumber ?? prev.lastRowNumber,
          headerRowNumber: d.headerRowNumber ?? prev.headerRowNumber ?? 1,
          columns: d.headers || d.columns || prev.columns,
          lastSyncedAt: d.lastSyncedAt || new Date().toISOString(),
          newRowsCount: d.newRowsCount || 0,
          updatedRowsCount: d.updatedRowsCount || 0,
          blankRowsCount: d.blankRowsCount || 0,
          eligibleAdRowsCount: d.eligibleAdRowsCount ?? d.readyRowsCount ?? prev.eligibleAdRowsCount,
          validationErrorRowsCount: d.validationErrorRowsCount ?? d.correctionRequiredRowsCount ?? prev.validationErrorRowsCount,
          newRowNumbers: d.newRowNumbers || [],
          updatedRowNumbers: d.updatedRowNumbers || [],
        }));
      } else {
        setSheetConnectError(res.data?.message || "Failed to sync spreadsheet.");
        setExcelSyncStatus("FAILED");
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || "Failed to sync spreadsheet.";
      setSheetConnectError(msg);
      setExcelSyncStatus("FAILED");
    } finally {
      setIsSyncingSheet(false);
    }
  };

  const handleExcelFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsConnectingSheet(true);
      setSheetConnectError("");
      setSheetConnectMsg("");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("nodeId", node?.id || "");
      if (worksheetName) formData.append("worksheetName", worksheetName);

      const res = await aiContextApi.uploadExcel(formData);

      if (res.data?.success) {
        setExcelSyncStatus("CONNECTED");
        setExcelProvider("Excel File Upload");
        setWorkbookName(res.data.data?.spreadsheetName || file.name);
        setWorksheetName(res.data.data?.worksheetName || "Sheet1");
        setSheetConnectMsg(res.data.message);
        setSheetStats({
          totalRows: res.data.data?.totalRows || 0,
          columns: res.data.data?.columns || [],
          readyRowsCount: res.data.data?.readyRowsCount || 0,
          correctionRequiredRowsCount: res.data.data?.correctionRequiredRowsCount || 0,
          lastSyncedAt: res.data.data?.lastSyncedAt || new Date().toISOString(),
        });
      } else {
        setSheetConnectError(res.data?.message || "Failed to upload Excel file.");
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || "Failed to upload Excel file.";
      setSheetConnectError(msg);
    } finally {
      setIsConnectingSheet(false);
    }
  };

  // Google Drive Live OAuth States
  const [driveOAuthStatus, setDriveOAuthStatus] = useState({
    connected: false,
    email: "",
    name: "",
    hasRefreshToken: false,
    expiresAt: null,
  });
  const [isInitiatingDriveOAuth, setIsInitiatingDriveOAuth] = useState(false);
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [driveConnectMsg, setDriveConnectMsg] = useState("");
  const [driveConnectError, setDriveConnectError] = useState("");

  // Check Drive OAuth status on mount
  const checkDriveOAuthStatus = async () => {
    try {
      const res = await aiContextApi.getDriveStatus();
      if (res.data?.success && res.data.data) {
        const isConn = Boolean(res.data.data.connected);
        setDriveOAuthStatus(res.data.data);
        setGoogleDriveConnected(isConn);
        if (res.data.data.email) {
          setGoogleDriveEmail(res.data.data.email);
        }
      } else {
        setDriveOAuthStatus({ connected: false });
        setGoogleDriveConnected(false);
      }
    } catch (err) {
      console.warn("Could not check Drive status:", err.message);
      setDriveOAuthStatus({ connected: false });
      setGoogleDriveConnected(false);
    }
  };

  // Google OAuth Popup Trigger
  const handleInitiateGoogleDriveOAuth = async () => {
    try {
      setIsInitiatingDriveOAuth(true);
      setDriveConnectError("");
      setDriveConnectMsg("");

      const encodedState = btoa(
        JSON.stringify({
          channel: "google_drive",
          type: "drive",
          nodeId: node?.id || "warehouse_node",
          ts: Date.now(),
        })
      );
      const res = await aiContextApi.getDriveAuthUrl({ state: encodedState });
      const authUrl = res.data?.data?.url;
      if (!authUrl) {
        throw new Error("Could not retrieve Google OAuth authorization URL.");
      }

      const popupWidth = 620;
      const popupHeight = 720;
      const left = window.screenX + (window.outerWidth - popupWidth) / 2;
      const top = window.screenY + (window.outerHeight - popupHeight) / 2;

      const authPopup = window.open(
        authUrl,
        "GoogleDriveOAuthWindow",
        `width=${popupWidth},height=${popupHeight},left=${left},top=${top},status=no,toolbar=no,menubar=no`
      );

      if (!authPopup || authPopup.closed || typeof authPopup.closed === "undefined") {
        window.location.href = authUrl;
        return;
      }

      let handled = false;
      const handleMessage = async (event) => {
        if (
          event.data?.type === "GOOGLE_DRIVE_OAUTH_SUCCESS" ||
          (event.data?.channel === "google_drive" && event.data?.code) ||
          event.data === "oauth-success"
        ) {
          handled = true;
          window.removeEventListener("message", handleMessage);
          try {
            if (event.data?.code) {
              await aiContextApi.connectDrive({
                code: event.data.code,
                nodeId: node?.id,
              });
            }
          } catch (e) {
            console.warn("Drive connect post error:", e);
          }
          await checkDriveOAuthStatus();
          setGoogleDriveConnected(true);
          setDriveConnectMsg("Google Drive & Sheets OAuth connected successfully!");
          setIsInitiatingDriveOAuth(false);
        } else if (event.data?.type === "GOOGLE_DRIVE_OAUTH_ERROR") {
          handled = true;
          window.removeEventListener("message", handleMessage);
          setDriveConnectError(event.data?.error || "Google Drive OAuth authorization failed.");
          setIsInitiatingDriveOAuth(false);
        }
      };

      window.addEventListener("message", handleMessage);

      // Periodic check if popup was closed by user
      const pollTimer = setInterval(async () => {
        if (authPopup.closed) {
          clearInterval(pollTimer);
          if (!handled) {
            window.removeEventListener("message", handleMessage);
            setIsInitiatingDriveOAuth(false);
            await checkDriveOAuthStatus();
          }
        }
      }, 1000);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || "Failed to initiate Google OAuth";
      setDriveConnectError(msg);
      setIsInitiatingDriveOAuth(false);
    }
  };

  const handleDisconnectDrive = async () => {
    try {
      await aiContextApi.disconnectDrive();
      setGoogleDriveConnected(false);
      setGoogleDriveEmail("");
      setDriveOAuthStatus({
        connected: false,
        email: "",
        name: "",
        hasRefreshToken: false,
        expiresAt: null,
      });
      setDriveConnectMsg("Google Drive disconnected successfully.");
    } catch (err) {
      setDriveConnectError("Failed to disconnect Google Drive.");
    }
  };

  // Load connected accounts from backend
  useEffect(() => {
    let isMounted = true;
    const loadAccounts = async () => {
      try {
        setLoadingChannels(true);
        const [statusRes, accountsRes, googleAccountsRes] = await Promise.allSettled([
          channelApi.status(),
          channelApi.getAccounts(),
          channelApi.getGoogleAccounts(),
        ]);

        let rawList = [];
        if (accountsRes.status === "fulfilled" && Array.isArray(accountsRes.value?.data?.data)) {
          rawList.push(...accountsRes.value.data.data);
        }
        if (statusRes.status === "fulfilled" && Array.isArray(statusRes.value?.data?.data?.connectedList)) {
          rawList.push(...statusRes.value.data.data.connectedList);
        }
        if (statusRes.status === "fulfilled" && Array.isArray(statusRes.value?.data?.data?.channels?.googleAds?.accounts)) {
          statusRes.value.data.data.channels.googleAds.accounts.forEach((g) => {
            rawList.push({
              channelId: "google",
              channelName: "Google Ads",
              accountId: String(g.accountId || g.customerId || ""),
              accountName: g.accountName || g.name || `Google Ads (${g.accountId || g.customerId})`,
              currency: g.currency || g.currencyCode || "INR",
              isManager: g.isManager,
            });
          });
        }
        if (statusRes.status === "fulfilled" && Array.isArray(statusRes.value?.data?.data?.channels?.googleAds?.hierarchyAccounts)) {
          statusRes.value.data.data.channels.googleAds.hierarchyAccounts.forEach((g) => {
            rawList.push({
              channelId: "google",
              channelName: "Google Ads",
              accountId: String(g.customerId || g.accountId || ""),
              accountName: g.name || g.accountName || `Google Ads (${g.customerId || g.accountId})`,
              currency: g.currencyCode || g.currency || "INR",
              isManager: g.isManager,
            });
          });
        }
        if (googleAccountsRes.status === "fulfilled" && Array.isArray(googleAccountsRes.value?.data?.data?.accounts)) {
          googleAccountsRes.value.data.data.accounts.forEach((g) => {
            rawList.push({
              channelId: "google",
              channelName: "Google Ads",
              accountId: String(g.customerId || g.accountId || ""),
              accountName: g.name || g.accountName || `Google Ads (${g.customerId || g.accountId})`,
              currency: g.currencyCode || g.currency || "INR",
              isManager: g.isManager,
            });
          });
        }
        if (statusRes.status === "fulfilled" && Array.isArray(statusRes.value?.data?.data?.channels?.metaAds?.accounts)) {
          statusRes.value.data.data.channels.metaAds.accounts.forEach((m) => {
            rawList.push({
              channelId: "meta",
              channelName: "Meta Ads",
              accountId: String(m.accountId || ""),
              accountName: m.accountName || "Meta Ads Account",
              currency: m.currency || "INR",
            });
          });
        }

        // Strictly deduplicate by channelId + accountId
        const seenKeys = new Set();
        const uniqueList = [];
        for (const item of rawList) {
          const accId = String(item.accountId || item.customerId || "").trim();
          const chan = String(item.channelId || item.id || "channel").trim();
          const key = `${chan}_${accId}`;
          if (accId && !seenKeys.has(key)) {
            seenKeys.add(key);
            uniqueList.push({
              ...item,
              accountId: accId,
              accountName: item.accountName || item.name || `${item.channelName || "Channel"} (${accId})`,
            });
          }
        }

        if (isMounted) {
          setConnectedAccounts(uniqueList);
        }
      } catch (err) {
        console.warn("[NodeDrawer] Error loading connected accounts:", err);
      } finally {
        if (isMounted) setLoadingChannels(false);
      }
    };
    loadAccounts();
    return () => {
      isMounted = false;
    };
  }, []);

  // Compute unique connected channel names
  const connectedChannels = useMemo(() => {
    const names = connectedAccounts
      .map((item) => {
        if (item.channelName) return item.channelName;
        if (item.channelId === "meta" || item.id === "meta") return "Meta Ads";
        if (item.channelId === "google" || item.id === "google") return "Google Ads";
        return item.name || item.channelId;
      })
      .filter(Boolean);
    return Array.from(new Set(names));
  }, [connectedAccounts]);

  // Synchronize state from node props
  useEffect(() => {
    if (!node) return;
    if (prevNodeIdRef.current === node.id) {
      // Do not wipe out local drawer state while editing the same node
      return;
    }
    prevNodeIdRef.current = node.id;
    setContextTag(node.contextTag || node.data?.contextTag || "Primary Marketing Context");
    setSavedBadge(false);

    // Business Unit
    setBuName(node.data?.name || node.label || "");
    setBuDescription(node.data?.description || "");

    // Ad Channel
    const initialChannel = node.data?.channelName || node.data?.channel || "";
    setChannelName(initialChannel);
    setAdAccountId(node.data?.adAccountId || "");
    setFunnelEvent(node.data?.funnelEvent || "Purchase");
    setFunnelDescription(node.data?.funnelDescription || "");

    // Marketing Brief
    setBriefName(node.data?.name || node.label || "Marketing Brief");
    setBriefDescription(node.data?.description || node.data?.briefDescription || "");
    let resolvedList = [];
    const rawList = Array.isArray(node.data?.metricsList) ? node.data.metricsList : [];
    if (rawList.length > 0) {
      rawList.forEach((item, idx) => {
        const text = String(item.metrics || "").trim();
        if (text.includes(" | [") || (text.startsWith("[") && text.includes("]:"))) {
          const unpacked = unpackConcatenatedMetrics(text);
          if (unpacked.length > 0) {
            resolvedList.push(...unpacked);
            return;
          }
        }
        resolvedList.push({
          id: String(item.id || `m_${idx}_${Date.now()}`),
          startDate: String(item.startDate || ""),
          endDate: String(item.endDate || ""),
          formattedPeriod: String(
            item.formattedPeriod ||
            (item.startDate && item.endDate ? `${item.startDate} to ${item.endDate}` : item.startDate || item.endDate || "")
          ),
          metrics: text,
        });
      });
    }

    if (resolvedList.length === 0 && (node.data?.metrics || node.data?.startDate || node.data?.endDate)) {
      const rawText = String(node.data?.metrics || "").trim();
      if (rawText.includes(" | [") || (rawText.startsWith("[") && rawText.includes("]:"))) {
        resolvedList = unpackConcatenatedMetrics(rawText);
      } else if (rawText || node.data?.startDate || node.data?.endDate) {
        resolvedList = [
          {
            id: `m_${Date.now()}`,
            startDate: node.data?.startDate || "",
            endDate: node.data?.endDate || "",
            formattedPeriod: node.data?.formattedPeriod || (node.data?.startDate && node.data?.endDate ? `${node.data.startDate} to ${node.data.endDate}` : node.data?.startDate || node.data?.endDate || ""),
            metrics: rawText,
          },
        ];
      }
    }

    setMetricsList(resolvedList);
    setBriefMetrics("");
    setBriefStartDate("");
    setBriefEndDate("");

    // Product
    setProductName(node.data?.productName || node.data?.name || "");
    setProductUrl(node.data?.productUrl || "");
    const platforms = node.data?.productPlatforms || ["Web"];
    setIsAppSelected(platforms.includes("App"));
    setIsWebSelected(platforms.includes("Web") || platforms.length === 0);
    setProductsList(Array.isArray(node.data?.products) ? node.data.products : []);
    setProductSearch("");
    setShowBulkPaste(false);

    // Data Warehouse (Excel Sheet = WHAT, Google Drive = MEDIA)
    const hasExplicitSheets = Array.isArray(node.data?.sheets);
    const rawSheets = hasExplicitSheets ? node.data.sheets.slice(0, 10) : [];

    if (hasExplicitSheets) {
      if (rawSheets.length > 0) {
        setSheetsList(
          rawSheets.map((s, idx) => ({
            id: s.id || `sheet_${idx}_${Date.now()}`,
            sheetUrl: s.sheetUrl || "",
            excelProvider: s.excelProvider || "Google Sheets",
            workbookName: s.workbookName || "",
            worksheetName: s.worksheetName || "Sheet1",
            availableTabs: Array.isArray(s.availableTabs) ? s.availableTabs : [],
            selectedTabIds: Array.isArray(s.selectedTabIds) ? s.selectedTabIds : (Array.isArray(s.availableTabs) ? s.availableTabs.map((t) => t.sheetId !== undefined ? t.sheetId : t.title) : []),
            selectedTabsData: Array.isArray(s.selectedTabsData) ? s.selectedTabsData : [],
            excelSyncStatus: s.excelSyncStatus || (s.sheetUrl ? "SYNCED" : "NOT_CONNECTED"),
            dataLabels: s.dataLabels || s.dataLevel || "",
            metaAccountId: s.metaAccountId || "",
            metaAccountName: s.metaAccountName || "",
            targetTab: s.targetTab || "",
            totalRows: s.totalRows || 0,
            totalDataRows: s.totalDataRows || s.totalRows || 0,
            totalSheetRows: s.totalSheetRows || (s.totalRows ? s.totalRows + 1 : 0),
            sheetColumns: s.sheetColumns || [],
            lastSyncedAt: s.lastSyncedAt || null,
            connectMsg: "",
            connectError: "",
            isConnecting: false,
          }))
        );
      } else {
        setSheetsList([
          {
            id: `sheet_${Date.now()}`,
            sheetUrl: "",
            excelProvider: "Google Sheets",
            workbookName: "",
            worksheetName: "Sheet1",
            excelSyncStatus: "NOT_CONNECTED",
            dataLabels: "",
            totalRows: 0,
            totalDataRows: 0,
            totalSheetRows: 0,
            sheetColumns: [],
            lastSyncedAt: null,
            connectMsg: "",
            connectError: "",
            isConnecting: false,
          },
        ]);
      }
    } else if (node.data?.sheetUrl) {
      setSheetsList([
        {
          id: `sheet_legacy_${Date.now()}`,
          sheetUrl: node.data.sheetUrl,
          excelProvider: node.data?.excelProvider || "Google Sheets",
          workbookName: node.data?.workbookName || "",
          worksheetName: node.data?.worksheetName || "Sheet1",
          availableTabs: Array.isArray(node.data?.availableTabs) ? node.data.availableTabs : [],
          selectedTabIds: Array.isArray(node.data?.selectedTabIds) ? node.data.selectedTabIds : (Array.isArray(node.data?.availableTabs) ? node.data.availableTabs.map((t) => t.sheetId !== undefined ? t.sheetId : t.title) : []),
          selectedTabsData: Array.isArray(node.data?.selectedTabsData) ? node.data.selectedTabsData : [],
          excelSyncStatus: node.data?.excelSyncStatus || "SYNCED",
          dataLabels: node.data?.dataLabels || node.data?.dataLevel || "",
          totalRows: node.data?.totalRows || 0,
          totalDataRows: node.data?.totalDataRows || node.data?.totalRows || 0,
          totalSheetRows: node.data?.totalSheetRows || (node.data?.totalRows ? node.data.totalRows + 1 : 0),
          sheetColumns: node.data?.sheetColumns || [],
          lastSyncedAt: node.data?.lastSyncedAt || null,
          connectMsg: "",
          connectError: "",
          isConnecting: false,
        },
      ]);
    } else {
      setSheetsList([
        {
          id: `sheet_${Date.now()}`,
          sheetUrl: "",
          excelProvider: "Google Sheets",
          workbookName: "",
          worksheetName: "Sheet1",
          excelSyncStatus: "NOT_CONNECTED",
          dataLabels: "",
          totalRows: 0,
          totalDataRows: 0,
          totalSheetRows: 0,
          sheetColumns: [],
          lastSyncedAt: null,
          connectMsg: "",
          connectError: "",
          isConnecting: false,
        },
      ]);
    }

    setSheetUrl(node.data?.sheetUrl || "");
    setExcelProvider(node.data?.excelProvider || "Google Sheets");
    setWorkbookName(node.data?.workbookName || node.data?.workbookId || "");
    setWorksheetName(node.data?.worksheetName || node.data?.worksheetId || "");
    setExcelSyncStatus(node.data?.excelSyncStatus || (node.data?.sheetUrl ? "SYNCED" : "NOT_CONNECTED"));
    setGoogleDriveConnected(Boolean(node.data?.googleDriveConnected));
    setGoogleDriveEmail(node.data?.googleDriveEmail || "");
    setGoogleDriveFolder(node.data?.googleDriveFolderName || node.data?.googleDriveFolderId || "");
    setDataLabels(node.data?.dataLevel || node.data?.dataLabels || "");
    setWarehousePlatform(node.data?.databasePlatform || "Excel Sheet & Google Drive");

    const lastDiff = node.data?.sheetMetadata?.lastSyncDiff || {};
    setSheetStats({
      totalRows: node.data?.totalRows || 0,
      totalDataRows: node.data?.totalDataRows || node.data?.totalRows || 0,
      totalSheetRows: node.data?.totalSheetRows || (node.data?.totalRows ? node.data.totalRows + 1 : 0),
      lastRowNumber: node.data?.lastRowNumber || lastDiff.lastRowNumber || (node.data?.totalRows ? node.data.totalRows + 1 : 0),
      headerRowNumber: node.data?.headerRowNumber || 1,
      columns: node.data?.sheetColumns || [],
      lastSyncedAt: node.data?.lastSyncedAt || null,
      newRowsCount: lastDiff.newRowsCount || 0,
      updatedRowsCount: lastDiff.updatedRowsCount || 0,
      blankRowsCount: lastDiff.blankRowsCount || 0,
      eligibleAdRowsCount: node.data?.eligibleAdRowsCount ?? node.data?.readyRowsCount ?? lastDiff.eligibleAdRowsCount ?? 0,
      validationErrorRowsCount: node.data?.validationErrorRowsCount ?? node.data?.correctionRequiredRowsCount ?? lastDiff.validationErrorRowsCount ?? 0,
      newRowNumbers: lastDiff.newRowNumbers || [],
      updatedRowNumbers: lastDiff.updatedRowNumbers || [],
    });
    if (node.data?.sheetMetadata?.lastSyncError) {
      setSheetConnectError(node.data.sheetMetadata.lastSyncError);
    }

    if (node.type === "data_warehouse") {
      checkDriveOAuthStatus();
    }
  }, [node]);

  // Product Catalog Handlers
  const handleAddSingleProduct = (e) => {
    e?.preventDefault?.();
    if (!newProdName.trim()) return;
    const newProduct = {
      id: `prod_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: newProdName.trim(),
      price: newProdPrice.trim() || undefined,
      sku: newProdSku.trim() || undefined,
      category: newProdCategory.trim() || undefined,
      url: newProdUrl.trim() || undefined,
      platforms: [
        ...(isWebSelected ? ["Web"] : []),
        ...(isAppSelected ? ["App"] : []),
      ],
      createdAt: new Date().toISOString(),
    };
    setProductsList((prev) => [newProduct, ...prev]);
    setNewProdName("");
    setNewProdPrice("");
    setNewProdSku("");
    setNewProdCategory("");
    setNewProdUrl("");
  };

  const handleBulkAddProducts = () => {
    if (!bulkText.trim()) return;
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    const parsedProducts = [];

    lines.forEach((line, idx) => {
      // Split by comma or tab or semicolon
      const parts = line.split(/[,;\t]/).map((p) => p.trim());
      const name = parts[0];
      if (!name) return;
      const price = parts[1] || "";
      const url = parts[2] || "";
      const category = parts[3] || "General";
      const sku = parts[4] || `SKU-${Date.now().toString().slice(-4)}-${idx + 1}`;

      parsedProducts.push({
        id: `prod_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 4)}`,
        name,
        price,
        url,
        category,
        sku,
        platforms: ["Web"],
        createdAt: new Date().toISOString(),
      });
    });

    if (parsedProducts.length > 0) {
      setProductsList((prev) => [...parsedProducts, ...prev]);
      setBulkText("");
      setShowBulkPaste(false);
    }
  };

  const handleDeleteProduct = (productId) => {
    setProductsList((prev) => prev.filter((p) => p.id !== productId));
  };

  // Filtered products for high-performance rendering
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return productsList;
    const q = productSearch.toLowerCase();
    return productsList.filter(
      (p) =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        (p.url && p.url.toLowerCase().includes(q))
    );
  }, [productsList, productSearch]);

  // If channelName is not set yet, default to first connected channel if available
  useEffect(() => {
    if (!channelName && connectedChannels.length > 0) {
      const firstChannel = connectedChannels[0];
      setChannelName(firstChannel);

      const matching = connectedAccounts.filter((item) => {
        const itemChannel = (item.channelName || item.channelId || item.name || "").toLowerCase();
        const lower = firstChannel.toLowerCase();
        if (lower.includes("meta") && itemChannel.includes("meta")) return true;
        if (lower.includes("google") && itemChannel.includes("google")) return true;
        return itemChannel === lower || lower.includes(itemChannel);
      });
      if (matching.length > 0 && matching[0].accountId && !adAccountId) {
        setAdAccountId(matching[0].accountId);
      }
    }
  }, [connectedChannels, connectedAccounts, channelName, adAccountId]);

  if (!node) return null;

  const nodeInfo = NODE_TYPE_INFO[node.type] || {
    title: node.type,
    badge: "NODE",
    color: "#64748B",
    bg: "#F8FAFC",
  };

  const IconComponent = TYPE_ICONS[node.type] || Settings2;

  // Filter connected accounts based on currently selected channelName with strict deduplication
  const matchingAccounts = useMemo(() => {
    if (!channelName) return [];
    const cName = channelName.toLowerCase();
    const filtered = connectedAccounts.filter((item) => {
      const itemChannel = (item.channelName || item.channelId || item.name || item.id || "").toLowerCase();
      if (cName.includes("meta") && itemChannel.includes("meta")) return true;
      if (cName.includes("google") && itemChannel.includes("google")) return true;
      return itemChannel === cName || cName.includes(itemChannel);
    });

    const seenAccIds = new Set();
    const unique = [];
    for (const acc of filtered) {
      const cleanId = String(acc.accountId || "").trim();
      if (cleanId && !seenAccIds.has(cleanId)) {
        seenAccIds.add(cleanId);
        unique.push(acc);
      }
    }
    return unique;
  }, [connectedAccounts, channelName]);

  const displayedAccounts = useMemo(() => {
    if (!accountSearch.trim()) return matchingAccounts;
    const q = accountSearch.toLowerCase();
    return matchingAccounts.filter(
      (acc) =>
        (acc.accountName && acc.accountName.toLowerCase().includes(q)) ||
        (acc.name && acc.name.toLowerCase().includes(q)) ||
        (acc.accountId && String(acc.accountId).toLowerCase().includes(q))
    );
  }, [matchingAccounts, accountSearch]);

  const handleSelectChannel = (c) => {
    setChannelName(c);
    setAccountSearch("");
    const accs = connectedAccounts.filter((item) => {
      const itemChannel = (item.channelName || item.channelId || item.name || item.id || "").toLowerCase();
      const lowerC = c.toLowerCase();
      if (lowerC.includes("meta") && itemChannel.includes("meta")) return true;
      if (lowerC.includes("google") && itemChannel.includes("google")) return true;
      return itemChannel === lowerC || lowerC.includes(itemChannel);
    });
    if (accs.length > 0 && accs[0].accountId) {
      setAdAccountId(accs[0].accountId);
    }
  };

  const handleSave = async (e) => {
    e?.preventDefault?.();
    setIsSaving(true);

    let nodeLabel = node.label || nodeInfo.title;
    let nodeSubtitle = node.subtitle || "";
    let dataPayload = {
      contextTag: contextTag.trim() || "Primary Marketing Context",
      ...node.data,
    };

    if (node.type === "business_unit") {
      nodeLabel = buName.trim() || "Business Unit";
      nodeSubtitle = buDescription.trim().slice(0, 45);
      dataPayload = {
        ...dataPayload,
        name: buName.trim(),
        description: buDescription.trim(),
      };
    } else if (node.type === "ad_channel") {
      const matchedAccount = matchingAccounts.find(a => String(a.accountId).trim() === String(adAccountId).trim())
        || connectedAccounts.find(a => String(a.accountId).trim() === String(adAccountId).trim());
      const accName = matchedAccount?.accountName || matchedAccount?.name || "";
      
      let parentBuName = node.data?.businessUnitName || "";
      if (!parentBuName && (node.previousNodeType === "business_unit" || !node.previousNodeType)) {
        parentBuName = node.previousNodeLabel || "";
      }

      nodeLabel = accName
        ? `${channelName.trim() || "Ad Channel"}: ${accName}`
        : (channelName.trim() || "Ad Channel");

      nodeSubtitle = `🎯 ${funnelEvent.trim() || "Purchase"}${adAccountId ? ` • ${adAccountId}` : ""}`;

      dataPayload = {
        ...dataPayload,
        name: nodeLabel,
        businessUnitName: parentBuName,
        channelName: channelName.trim(),
        channel: channelName.trim(),
        adAccountId: adAccountId.trim(),
        accountName: accName || "",
        funnelEvent: funnelEvent.trim() || "Purchase",
        funnelDescription: funnelDescription.trim(),
      };
    } else if (node.type === "marketing_brief") {
      let updatedMetricsList = [...metricsList];
      // If user typed into the inputs but didn't click "Add", include it automatically
      if (briefMetrics.trim() || briefStartDate || briefEndDate) {
        const period = getBriefFormattedPeriod();
        const exists = updatedMetricsList.some(
          (m) => m.startDate === briefStartDate && m.endDate === briefEndDate && m.metrics === briefMetrics.trim()
        );
        if (!exists) {
          updatedMetricsList.push({
            id: `m_${Date.now()}_${updatedMetricsList.length}`,
            startDate: briefStartDate,
            endDate: briefEndDate,
            formattedPeriod: period,
            metrics: briefMetrics.trim(),
          });
        }
      }

      let finalMetricsList = [];
      updatedMetricsList.forEach((item, idx) => {
        const text = String(item.metrics || "").trim();
        if (text.includes(" | [") || (text.startsWith("[") && text.includes("]:"))) {
          const unpacked = unpackConcatenatedMetrics(text);
          if (unpacked.length > 0) {
            finalMetricsList.push(...unpacked);
            return;
          }
        }
        finalMetricsList.push({
          ...item,
          id: item.id || `m_${idx}_${Date.now()}`,
          formattedPeriod: item.formattedPeriod || (item.startDate && item.endDate ? `${item.startDate} to ${item.endDate}` : item.startDate || item.endDate || ""),
        });
      });

      setMetricsList(finalMetricsList);
      setBriefMetrics("");
      setBriefStartDate("");
      setBriefEndDate("");

      nodeLabel = briefName.trim() || "Marketing Brief";
      const count = finalMetricsList.length;
      let primarySubtitle = "";
      if (briefDescription.trim()) {
        primarySubtitle = briefDescription.trim().slice(0, 45);
      } else if (count > 1) {
        primarySubtitle = `📅 ${count} Date Ranges Configured`;
      } else if (count === 1) {
        const first = finalMetricsList[0];
        primarySubtitle = first.formattedPeriod
          ? `📅 ${first.formattedPeriod}${first.metrics ? ` • ${first.metrics.slice(0, 25)}` : ""}`
          : (first.metrics ? `Metrics: ${first.metrics.slice(0, 35)}` : (briefName.trim() || "Marketing Brief"));
      } else {
        const formattedPeriod = getBriefFormattedPeriod();
        primarySubtitle = formattedPeriod
          ? `📅 ${formattedPeriod}${briefMetrics ? ` • ${briefMetrics.slice(0, 25)}` : ""}`
          : (briefMetrics ? `Metrics: ${briefMetrics.slice(0, 35)}` : "Target audience, hooks & campaign objectives");
      }
      nodeSubtitle = primarySubtitle;

      const firstItem = finalMetricsList[0] || {};
      const consolidatedMetrics = finalMetricsList.length > 0
        ? finalMetricsList.map((m) => m.formattedPeriod ? `[${m.formattedPeriod}]: ${m.metrics}` : m.metrics).join(" | ")
        : briefMetrics.trim();

      let parentBuName = node.data?.businessUnitName || "";
      if (!parentBuName && (node.previousNodeType === "business_unit" || !node.previousNodeType)) {
        parentBuName = node.previousNodeLabel || "";
      }

      dataPayload = {
        ...dataPayload,
        name: briefName.trim() || "Marketing Brief",
        description: briefDescription.trim(),
        briefDescription: briefDescription.trim(),
        businessUnitName: parentBuName,
        startDate: firstItem.startDate || briefStartDate,
        endDate: firstItem.endDate || briefEndDate,
        formattedPeriod: firstItem.formattedPeriod || getBriefFormattedPeriod(),
        metrics: consolidatedMetrics,
        metricsList: finalMetricsList,
      };
    } else if (node.type === "product") {
      const selectedPlatforms = [];
      if (isAppSelected) selectedPlatforms.push("App");
      if (isWebSelected) selectedPlatforms.push("Web");
      const totalCount = productsList.length;
      nodeLabel = productName.trim() || (totalCount > 0 ? `Products (${totalCount})` : "Product Catalog");
      nodeSubtitle = totalCount > 0
        ? `📦 ${totalCount} Products • ${selectedPlatforms.join(" & ") || "Web"}`
        : (selectedPlatforms.join(" & ") + (productUrl ? ` • ${productUrl}` : ""));
      dataPayload = {
        ...dataPayload,
        productName: productName.trim(),
        productUrl: productUrl.trim(),
        productPlatforms: selectedPlatforms,
        products: productsList,
        catalogCount: totalCount,
      };
    } else if (node.type === "data_warehouse") {
      const sheetsToSave = sheetsList.slice(0, 10).map((s, idx) => ({
        id: String(s.id || `sheet_${idx}_${Date.now()}`),
        sheetUrl: (s.sheetUrl || "").trim(),
        excelProvider: s.excelProvider || "Google Sheets",
        workbookName: (s.workbookName || "").trim(),
        worksheetName: (s.worksheetName || "Sheet1").trim(),
        availableTabs: Array.isArray(s.availableTabs) ? s.availableTabs : [],
        selectedTabIds: Array.isArray(s.selectedTabIds) ? s.selectedTabIds : [],
        selectedTabsData: Array.isArray(s.selectedTabsData) ? s.selectedTabsData : [],
        excelSyncStatus: s.excelSyncStatus || (s.sheetUrl ? "SYNCED" : "NOT_CONNECTED"),
        totalRows: Number(s.totalRows || 0),
        totalDataRows: Number(s.totalDataRows || s.totalRows || 0),
        totalSheetRows: Number(s.totalSheetRows || (s.totalRows ? s.totalRows + 1 : 0)),
        sheetColumns: Array.isArray(s.sheetColumns) ? s.sheetColumns : [],
        dataLabels: (s.dataLabels || "").trim(),
        dataLevel: (s.dataLabels || "").trim(),
        metaAccountId: (s.metaAccountId || "").trim(),
        metaAccountName: (s.metaAccountName || "").trim(),
        targetTab: (s.targetTab || "").trim(),
        lastSyncedAt: s.lastSyncedAt || null,
      }));

      const connectedSheets = sheetsToSave.filter((s) => Boolean(s.sheetUrl));
      const primaryConnected = connectedSheets[0] || null;
      const totalConnected = connectedSheets.length;

      nodeLabel = totalConnected > 1
        ? `Warehouse (${totalConnected} Sheets)`
        : (primaryConnected?.workbookName || (primaryConnected?.sheetUrl ? "Connected Google Sheet" : "Excel & Drive Warehouse"));
      if (primaryConnected?.excelProvider && totalConnected <= 1 && primaryConnected?.sheetUrl) {
        nodeLabel = `${nodeLabel} (${primaryConnected.excelProvider})`;
      }

      nodeSubtitle = totalConnected > 1
        ? `📊 ${totalConnected} Sheets Connected`
        : (primaryConnected?.sheetUrl ? `🔗 ${primaryConnected.sheetUrl.slice(0, 38)}...` : `Drive: ${googleDriveEmail ? "Connected" : "Linked"}`);

      dataPayload = {
        ...dataPayload,
        warehouseSource: "both",
        sheetUrl: primaryConnected ? primaryConnected.sheetUrl : "",
        excelProvider: primaryConnected ? primaryConnected.excelProvider : "Google Sheets",
        workbookName: primaryConnected ? primaryConnected.workbookName : "",
        worksheetName: primaryConnected ? primaryConnected.worksheetName : "Sheet1",
        availableTabs: primaryConnected ? (primaryConnected.availableTabs || []) : (node.data?.availableTabs || []),
        selectedTabIds: primaryConnected ? (primaryConnected.selectedTabIds || []) : (node.data?.selectedTabIds || []),
        selectedTabsData: primaryConnected ? (primaryConnected.selectedTabsData || []) : (node.data?.selectedTabsData || []),
        excelSyncStatus: primaryConnected ? primaryConnected.excelSyncStatus : "NOT_CONNECTED",
        totalRows: primaryConnected ? Number(primaryConnected.totalRows || 0) : 0,
        totalDataRows: primaryConnected ? Number(primaryConnected.totalDataRows || 0) : 0,
        dataLevel: primaryConnected ? primaryConnected.dataLabels : (dataLabels || "").trim(),
        dataLabels: primaryConnected ? primaryConnected.dataLabels : (dataLabels || "").trim(),
        databasePlatform: "Excel Sheet & Google Drive",
        googleDriveConnected,
        googleDriveEmail: googleDriveEmail.trim(),
        googleDriveFolderName: googleDriveFolder.trim(),
        sheets: sheetsToSave,
      };
    }

    try {
      await onSave(node.id, {
        label: nodeLabel,
        subtitle: nodeSubtitle,
        contextTag: contextTag.trim() || "Primary Marketing Context",
        data: dataPayload,
      });

      setSavedBadge(true);
      setTimeout(() => setSavedBadge(false), 2500);
    } catch (err) {
      console.error("[NodeDetailDrawer] Failed to save node details:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.aside
      initial={{ x: 420, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 420, opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="node-detail-drawer"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: 400,
        backgroundColor: "#FFFFFF",
        borderLeft: "1px solid #E2E8F0",
        boxShadow: "-8px 0 30px rgba(15, 23, 42, 0.1)",
        zIndex: 900,
        display: "flex",
        flexDirection: "column",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Drawer Header */}
      <div
        style={{
          padding: "14px 18px",
          borderBottom: "1px solid #F1F5F9",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "#FAFBFD",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              backgroundColor: `${nodeInfo.color}15`,
              color: nodeInfo.color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconComponent size={18} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#0F172A" }}>
              {node.label || nodeInfo.title}
            </h3>
            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                color: nodeInfo.color,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {nodeInfo.badge} CONFIGURATION
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#94A3B8",
            padding: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
          }}
          title="Close panel"
        >
          <X size={18} />
        </button>
      </div>

      {/* Form Body */}
      <form
        onSubmit={handleSave}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Lineage Info Banner */}
        <div
          style={{
            backgroundColor: "#F8FAFC",
            border: "1px solid #E2E8F0",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: "11.5px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ color: "#64748B", fontWeight: 600 }}>Lineage:</span>
          <span style={{ color: "#2563EB", fontWeight: 700 }}>
            {node.previousNodeLabel ? `← Connected from ${node.previousNodeLabel}` : "START Root Node"}
          </span>
        </div>

        {/* 1. BUSINESS UNIT NODE FORM */}
        {node.type === "business_unit" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#1E293B", marginBottom: 5 }}>
                Business Unit Name <span style={{ color: "#EF4444" }}>*</span>
              </label>
              <input
                type="text"
                value={buName}
                onChange={(e) => setBuName(e.target.value)}
                placeholder="e.g. Retail Division, North America Brand, Direct To Consumer"
                required
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1px solid #CBD5E1",
                  fontSize: "12.5px",
                  outline: "none",
                  backgroundColor: "#FFFFFF",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#1E293B", marginBottom: 5 }}>
                Description
              </label>
              <textarea
                rows={4}
                value={buDescription}
                onChange={(e) => setBuDescription(e.target.value)}
                placeholder="Describe the business division scope, target region, or operations..."
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1px solid #CBD5E1",
                  fontSize: "12.5px",
                  outline: "none",
                  resize: "vertical",
                  backgroundColor: "#FFFFFF",
                  fontFamily: "inherit",
                }}
              />
            </div>
          </div>
        )}

        {/* 2. AD CHANNEL NODE FORM */}
        {node.type === "ad_channel" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#1E293B", marginBottom: 5 }}>
                Channel Name (Select Connected Channel) <span style={{ color: "#EF4444" }}>*</span>
              </label>

              {/* Only show connected channels */}
              {connectedChannels.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {connectedChannels.map((c) => {
                    const isSelected = channelName.toLowerCase() === c.toLowerCase();
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => handleSelectChannel(c)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 7,
                          border: isSelected ? "1.5px solid #2563EB" : "1px solid #E2E8F0",
                          backgroundColor: isSelected ? "#EFF6FF" : "#F8FAFC",
                          color: isSelected ? "#2563EB" : "#475569",
                          fontSize: "12px",
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <CheckCircle2 size={13} color={isSelected ? "#2563EB" : "#94A3B8"} />
                        <span>{c}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    backgroundColor: "#F8FAFC",
                    border: "1px solid #E2E8F0",
                    color: "#475569",
                    fontSize: "11.5px",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 8,
                  }}
                >
                  <AlertCircle size={14} color="#64748B" />
                  <span>No channels connected yet in Channels section.</span>
                </div>
              )}

              <input
                type="text"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="e.g. Meta Ads, Google Ads"
                required
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1px solid #CBD5E1",
                  fontSize: "12.5px",
                  outline: "none",
                  backgroundColor: "#FFFFFF",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#1E293B", marginBottom: 5 }}>
                Ad Account ID (Select from Connected Accounts)
              </label>

              {/* Dynamic Connected Accounts Options for the selected channel */}
              {matchingAccounts.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "11px", color: "#64748B", fontWeight: 600 }}>
                      Connected Ad Accounts ({matchingAccounts.length}):
                    </span>
                    {matchingAccounts.length > 3 && (
                      <span style={{ fontSize: "10px", color: "#94A3B8" }}>
                        Scroll to view all
                      </span>
                    )}
                  </div>

                  {/* Account Search input if multiple accounts exist */}
                  {matchingAccounts.length > 2 && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        backgroundColor: "#F8FAFC",
                        border: "1px solid #E2E8F0",
                        borderRadius: 6,
                        padding: "5px 8px",
                      }}
                    >
                      <Search size={12} color="#94A3B8" />
                      <input
                        type="text"
                        placeholder="Search account name or ID..."
                        value={accountSearch}
                        onChange={(e) => setAccountSearch(e.target.value)}
                        style={{
                          border: "none",
                          background: "transparent",
                          fontSize: "11.5px",
                          width: "100%",
                          outline: "none",
                          color: "#0F172A",
                        }}
                      />
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 220, overflowY: "auto", paddingRight: 2 }}>
                    {displayedAccounts.map((acc, idx) => {
                      const isSelected = String(adAccountId).trim() === String(acc.accountId).trim();
                      return (
                        <button
                          key={acc.accountId || idx}
                          type="button"
                          onClick={() => setAdAccountId(acc.accountId)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: isSelected ? "1.5px solid #2563EB" : "1px solid #E2E8F0",
                            backgroundColor: isSelected ? "#EFF6FF" : "#FFFFFF",
                            color: "#1E293B",
                            fontSize: "12px",
                            textAlign: "left",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                            gap: 8,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
                            <CheckCircle2 size={14} color={isSelected ? "#2563EB" : "#CBD5E1"} style={{ flexShrink: 0 }} />
                            <div style={{ minWidth: 0 }}>
                              <span style={{ fontWeight: isSelected ? 700 : 500, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {acc.accountName || acc.name || "Ad Account"}
                              </span>
                              {acc.isManager && (
                                <span style={{ fontSize: "9.5px", color: "#2563EB", fontWeight: 600 }}>
                                  Manager MCC
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                            {acc.currency && (
                              <span style={{ fontSize: "9px", color: "#64748B", fontWeight: 600, backgroundColor: "#F1F5F9", padding: "1px 4px", borderRadius: 3 }}>
                                {acc.currency}
                              </span>
                            )}
                            <code
                              style={{
                                fontSize: "11px",
                                color: isSelected ? "#2563EB" : "#64748B",
                                backgroundColor: isSelected ? "#DBEAFE" : "#F1F5F9",
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontWeight: 600,
                              }}
                            >
                              {acc.accountId}
                            </code>
                          </div>
                        </button>
                      );
                    })}

                    {displayedAccounts.length === 0 && (
                      <div style={{ fontSize: "11px", color: "#94A3B8", textAlign: "center", padding: "8px" }}>
                        No accounts match "{accountSearch}"
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                channelName && (
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#64748B",
                      padding: "6px 10px",
                      backgroundColor: "#F8FAFC",
                      borderRadius: 6,
                      border: "1px solid #E2E8F0",
                      marginBottom: 8,
                    }}
                  >
                    No connected ad accounts found for <strong>{channelName}</strong>.
                  </div>
                )
              )}

              <input
                type="text"
                value={adAccountId}
                onChange={(e) => setAdAccountId(e.target.value)}
                placeholder="e.g. act_1234567890123"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1px solid #CBD5E1",
                  fontSize: "12.5px",
                  outline: "none",
                  backgroundColor: "#FFFFFF",
                }}
              />
            </div>

            <div style={{ backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "12px", display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#0F172A", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                Funnel Event Settings
              </span>
              <div>
                <label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "#334155", marginBottom: 4 }}>
                  Funnel Event
                </label>
                <input
                  type="text"
                  value={funnelEvent}
                  onChange={(e) => setFunnelEvent(e.target.value)}
                  placeholder="e.g. Purchase, Lead, ViewContent, AddToCart"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid #CBD5E1",
                    fontSize: "12px",
                    backgroundColor: "#FFFFFF",
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "#334155", marginBottom: 4 }}>
                  Funnel Event Description
                </label>
                <textarea
                  rows={2}
                  value={funnelDescription}
                  onChange={(e) => setFunnelDescription(e.target.value)}
                  placeholder="e.g. High-intent conversion event firing on checkout thank-you page"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid #CBD5E1",
                    fontSize: "12px",
                    backgroundColor: "#FFFFFF",
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* 3. MARKETING BRIEF NODE FORM */}
        {node.type === "marketing_brief" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Brief Name */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#1E293B", marginBottom: 5 }}>
                Brief Title / Campaign Objective <span style={{ color: "#EF4444" }}>*</span>
              </label>
              <input
                type="text"
                value={briefName}
                onChange={(e) => setBriefName(e.target.value)}
                placeholder="e.g. Marketing Brief, Festive Season Promo, Retargeting Campaign"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1px solid #CBD5E1",
                  fontSize: "12.5px",
                  outline: "none",
                  backgroundColor: "#FFFFFF",
                }}
              />
            </div>

            {/* Strategy, Hook & Offer Description */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#1E293B", marginBottom: 5 }}>
                Strategy, Hook & Offer Description
              </label>
              <textarea
                rows={3}
                value={briefDescription}
                onChange={(e) => setBriefDescription(e.target.value)}
                placeholder="Describe campaign goals, special discounts/offers, target audience hook, or messaging..."
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1px solid #CBD5E1",
                  fontSize: "12.5px",
                  outline: "none",
                  resize: "vertical",
                  backgroundColor: "#FFFFFF",
                  fontFamily: "inherit",
                }}
              />
            </div>

            {/* Date / Month Selection */}
            <div
              style={{
                backgroundColor: "#F8FAFC",
                border: "1px solid #E2E8F0",
                borderRadius: 10,
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#1E293B" }}>
                  Target Date Range
                </label>
                {briefStartDate && briefEndDate && (
                  <span style={{ fontSize: "11px", color: "#059669", fontWeight: 600 }}>
                    ✓ {briefStartDate} to {briefEndDate}
                  </span>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label style={{ display: "block", fontSize: "11.5px", color: "#64748B", marginBottom: 4 }}>
                    From Date
                  </label>
                  <input
                    type="date"
                    value={briefStartDate}
                    onChange={(e) => setBriefStartDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid #CBD5E1",
                      fontSize: "12px",
                      outline: "none",
                      backgroundColor: "#FFFFFF",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "11.5px", color: "#64748B", marginBottom: 4 }}>
                    To Date
                  </label>
                  <input
                    type="date"
                    value={briefEndDate}
                    onChange={(e) => setBriefEndDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid #CBD5E1",
                      fontSize: "12px",
                      outline: "none",
                      backgroundColor: "#FFFFFF",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Metrics Field */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#1E293B", marginBottom: 5 }}>
                Metrics (In Text)
              </label>
              <textarea
                rows={3}
                value={briefMetrics}
                onChange={(e) => setBriefMetrics(e.target.value)}
                placeholder="e.g. Target ROAS 3.5x, CPA < ₹450, Daily spend ₹1,000, CTR > 2.1%"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1px solid #CBD5E1",
                  fontSize: "12.5px",
                  outline: "none",
                  backgroundColor: "#FFFFFF",
                  fontFamily: "inherit",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                <button
                  type="button"
                  onClick={handleAddMetricsRange}
                  disabled={!briefMetrics.trim() && !briefStartDate && !briefEndDate}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 12px",
                    backgroundColor: (!briefMetrics.trim() && !briefStartDate && !briefEndDate) ? "#F1F5F9" : "#0081FB",
                    color: (!briefMetrics.trim() && !briefStartDate && !briefEndDate) ? "#94A3B8" : "#FFFFFF",
                    borderRadius: 6,
                    fontSize: "11.5px",
                    fontWeight: 600,
                    border: "none",
                    cursor: (!briefMetrics.trim() && !briefStartDate && !briefEndDate) ? "not-allowed" : "pointer",
                    boxShadow: (!briefMetrics.trim() && !briefStartDate && !briefEndDate) ? "none" : "0 2px 5px rgba(0, 129, 251, 0.2)",
                    transition: "all 0.15s ease",
                  }}
                >
                  <Plus size={13} />
                  Add Metric Range
                </button>
              </div>
            </div>

            {/* List of Configured Metrics with Date Ranges */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 2 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#1E293B" }}>
                  Configured Metrics ({metricsList.length})
                </label>
              </div>

              {metricsList.length === 0 ? (
                <div
                  style={{
                    padding: "14px 12px",
                    borderRadius: 8,
                    border: "1px dashed #CBD5E1",
                    backgroundColor: "#F8FAFC",
                    textAlign: "center",
                    color: "#94A3B8",
                    fontSize: "11.5px",
                  }}
                >
                  No metrics added yet. Set date range & metrics above and click "Add Metric Range".
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {metricsList.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      style={{
                        backgroundColor: "#FFFFFF",
                        border: "1.5px solid #BFDBFE",
                        borderRadius: 10,
                        overflow: "hidden",
                        boxShadow: "0 2px 6px rgba(0, 129, 251, 0.05)",
                      }}
                    >
                      {/* Blue Box Header: Contains the Date Range */}
                      <div
                        style={{
                          backgroundColor: "#EFF6FF",
                          borderBottom: "1px solid #DBEAFE",
                          padding: "8px 12px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              color: "#0081FB",
                              fontSize: "12px",
                              fontWeight: 700,
                            }}
                          >
                            <Calendar size={13} color="#0081FB" />
                            {item.formattedPeriod || (item.startDate && item.endDate ? `${item.startDate} to ${item.endDate}` : item.startDate || item.endDate || "Date Range")}
                          </span>
                          <span
                            style={{
                              fontSize: "10.5px",
                              fontWeight: 600,
                              color: "#60A5FA",
                              backgroundColor: "#DBEAFE",
                              padding: "1px 6px",
                              borderRadius: 10,
                            }}
                          >
                            #{idx + 1}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveMetricsRange(item.id)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "3px 4px",
                            color: "#94A3B8",
                            borderRadius: 4,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.15s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#EF4444";
                            e.currentTarget.style.backgroundColor = "#FEE2E2";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = "#94A3B8";
                            e.currentTarget.style.backgroundColor = "transparent";
                          }}
                          title="Remove this date & metric box"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      {/* Inside Box Body: Metric Value according to this Date */}
                      <div
                        style={{
                          padding: "10px 12px",
                          backgroundColor: "#FFFFFF",
                        }}
                      >
                        {item.metrics ? (
                          <div
                            style={{
                              fontSize: "12.5px",
                              color: "#0F172A",
                              lineHeight: 1.5,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
                            {item.metrics}
                          </div>
                        ) : (
                          <div style={{ fontSize: "11.5px", color: "#94A3B8", fontStyle: "italic" }}>
                            (No metrics value entered)
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 4. PRODUCT NODE FORM (Supports 100+ items, search, bulk import, and single add) */}
        {node.type === "product" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Primary Product / Catalog Name */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#1E293B", marginBottom: 5 }}>
                Catalog / Primary Product Name <span style={{ color: "#EF4444" }}>*</span>
              </label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g. Electronics & Wearables Catalog (100+ SKUs)"
                required
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1px solid #CBD5E1",
                  fontSize: "12.5px",
                  outline: "none",
                  backgroundColor: "#FFFFFF",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#1E293B", marginBottom: 5 }}>
                Default Landing URL / Storefront Link
              </label>
              <input
                type="url"
                value={productUrl}
                onChange={(e) => setProductUrl(e.target.value)}
                placeholder="https://myshop.com/products"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1px solid #CBD5E1",
                  fontSize: "12.5px",
                  outline: "none",
                  backgroundColor: "#FFFFFF",
                }}
              />
            </div>

            {/* Target Platform Checkboxes */}
            <div style={{ backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "12px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#1E293B", marginBottom: 8 }}>
                Target Product Platform (Select Checkbox)
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#1E293B",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isAppSelected}
                    onChange={(e) => setIsAppSelected(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: "#2563EB", cursor: "pointer" }}
                  />
                  <Smartphone size={15} color="#2563EB" />
                  <span>App</span>
                </label>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#1E293B",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isWebSelected}
                    onChange={(e) => setIsWebSelected(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: "#2563EB", cursor: "pointer" }}
                  />
                  <Globe size={15} color="#2563EB" />
                  <span>Web</span>
                </label>
              </div>
            </div>

            {/* 100+ Multi-Product Catalog Management Section */}
            <div
              style={{
                border: "1px solid #E2E8F0",
                borderRadius: 12,
                backgroundColor: "#FAFBFD",
                padding: "14px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <ShoppingBag size={17} color="#0081FB" />
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A" }}>
                    Product Catalog
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      backgroundColor: "#EFF6FF",
                      color: "#0081FB",
                      border: "1px solid #BFDBFE",
                      padding: "2px 8px",
                      borderRadius: 12,
                    }}
                  >
                    {productsList.length} {productsList.length === 1 ? "Product" : "Products"}
                  </span>
                </div>
              </div>

              {/* Quick Add Form */}
              <div
                style={{
                  backgroundColor: "#FFFFFF",
                  border: "1.5px solid #E2E8F0",
                  borderRadius: 10,
                  padding: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 9,
                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <Tag size={13} color="#0081FB" />
                  <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#334155" }}>
                    Add Product to Catalog
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 8 }}>
                  <input
                    type="text"
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    placeholder="Product Name *"
                    style={{
                      width: "100%",
                      minWidth: 0,
                      boxSizing: "border-box",
                      padding: "8px 10px",
                      fontSize: "12px",
                      border: "1px solid #CBD5E1",
                      borderRadius: 6,
                      outline: "none",
                    }}
                  />
                  <input
                    type="text"
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(e.target.value)}
                    placeholder="Price (e.g. ₹999)"
                    style={{
                      width: "100%",
                      minWidth: 0,
                      boxSizing: "border-box",
                      padding: "8px 10px",
                      fontSize: "12px",
                      border: "1px solid #CBD5E1",
                      borderRadius: 6,
                      outline: "none",
                    }}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input
                    type="text"
                    value={newProdSku}
                    onChange={(e) => setNewProdSku(e.target.value)}
                    placeholder="SKU Code"
                    style={{
                      width: "100%",
                      minWidth: 0,
                      boxSizing: "border-box",
                      padding: "8px 10px",
                      fontSize: "12px",
                      border: "1px solid #CBD5E1",
                      borderRadius: 6,
                      outline: "none",
                    }}
                  />
                  <input
                    type="text"
                    value={newProdCategory}
                    onChange={(e) => setNewProdCategory(e.target.value)}
                    placeholder="Category"
                    style={{
                      width: "100%",
                      minWidth: 0,
                      boxSizing: "border-box",
                      padding: "8px 10px",
                      fontSize: "12px",
                      border: "1px solid #CBD5E1",
                      borderRadius: 6,
                      outline: "none",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="url"
                    value={newProdUrl}
                    onChange={(e) => setNewProdUrl(e.target.value)}
                    placeholder="Product URL (https://...)"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      boxSizing: "border-box",
                      padding: "8px 10px",
                      fontSize: "12px",
                      border: "1px solid #CBD5E1",
                      borderRadius: 6,
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddSingleProduct}
                    disabled={!newProdName.trim()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "8px 14px",
                      fontSize: "12px",
                      fontWeight: 600,
                      backgroundColor: newProdName.trim() ? "#0081FB" : "#F1F5F9",
                      color: newProdName.trim() ? "#FFFFFF" : "#94A3B8",
                      border: "none",
                      borderRadius: 6,
                      cursor: newProdName.trim() ? "pointer" : "not-allowed",
                      boxShadow: newProdName.trim() ? "0 2px 6px rgba(0, 129, 251, 0.25)" : "none",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>

              {/* Search Bar for Catalog Navigation */}
              {productsList.length > 3 && (
                <div style={{ position: "relative" }}>
                  <Search
                    size={14}
                    color="#94A3B8"
                    style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
                  />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder={`Search among ${productsList.length} products...`}
                    style={{
                      width: "100%",
                      padding: "7px 10px 7px 32px",
                      fontSize: "12px",
                      border: "1px solid #CBD5E1",
                      borderRadius: 6,
                      backgroundColor: "#FFFFFF",
                      outline: "none",
                    }}
                  />
                </div>
              )}

              {/* Product List Scrollable View */}
              {filteredProducts.length > 0 ? (
                <div
                  style={{
                    maxHeight: 280,
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    paddingRight: 2,
                  }}
                >
                  {filteredProducts.map((p, idx) => {
                    const priceFormatted = p.price !== undefined && p.price !== null && String(p.price).trim() !== ""
                      ? (String(p.price).trim().startsWith("₹") || String(p.price).trim().startsWith("$") ? String(p.price).trim() : `₹${String(p.price).trim()}`)
                      : null;

                    return (
                      <div
                        key={p.id || idx}
                        style={{
                          backgroundColor: "#FFFFFF",
                          border: "1.5px solid #E2E8F0",
                          borderRadius: 10,
                          padding: "10px 12px",
                          display: "flex",
                          flexDirection: "column",
                          gap: 7,
                          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {/* Top Line: Icon, Title, Category, Price & Delete */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                width: 30,
                                height: 30,
                                borderRadius: 7,
                                backgroundColor: "#EFF6FF",
                                border: "1px solid #DBEAFE",
                                color: "#0081FB",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              <Package size={15} />
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0, flexWrap: "wrap" }}>
                              <strong
                                style={{
                                  fontSize: "13px",
                                  fontWeight: 600,
                                  color: "#0F172A",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  letterSpacing: "-0.01em",
                                }}
                              >
                                {p.name}
                              </strong>
                              {p.category && (
                                <span
                                  style={{
                                    fontSize: "10.5px",
                                    fontWeight: 600,
                                    color: "#475569",
                                    backgroundColor: "#F1F5F9",
                                    border: "1px solid #E2E8F0",
                                    padding: "1px 6px",
                                    borderRadius: 4,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {p.category}
                                </span>
                              )}
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {priceFormatted && (
                              <span
                                style={{
                                  fontSize: "11.5px",
                                  fontWeight: 700,
                                  color: "#059669",
                                  backgroundColor: "#ECFDF5",
                                  border: "1px solid #A7F3D0",
                                  padding: "2px 7px",
                                  borderRadius: 5,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {priceFormatted}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteProduct(p.id)}
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                color: "#94A3B8",
                                padding: "4px",
                                borderRadius: 4,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transition: "all 0.15s ease",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = "#EF4444";
                                e.currentTarget.style.backgroundColor = "#FEE2E2";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = "#94A3B8";
                                e.currentTarget.style.backgroundColor = "transparent";
                              }}
                              title="Remove product"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Bottom Sub-bar: SKU & URL link */}
                        {(p.sku || p.url) && (
                          <div
                            style={{
                              borderTop: "1px solid #F1F5F9",
                              paddingTop: 6,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 6,
                              flexWrap: "wrap",
                              fontSize: "11px",
                            }}
                          >
                            {p.sku ? (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  color: "#64748B",
                                  backgroundColor: "#F8FAFC",
                                  border: "1px solid #E2E8F0",
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                }}
                              >
                                <Tag size={10} color="#94A3B8" />
                                SKU: <strong>{p.sku}</strong>
                              </span>
                            ) : <span />}

                            {p.url && (
                              <a
                                href={p.url.startsWith("http") ? p.url : `https://${p.url}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  color: "#0081FB",
                                  textDecoration: "none",
                                  backgroundColor: "#EFF6FF",
                                  border: "1px solid #BFDBFE",
                                  padding: "2px 8px",
                                  borderRadius: 4,
                                  maxWidth: "240px",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  fontWeight: 500,
                                }}
                              >
                                <ExternalLink size={10} />
                                {p.url.replace(/^https?:\/\//, "")}
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  style={{
                    padding: "18px 12px",
                    textAlign: "center",
                    fontSize: "12px",
                    color: "#94A3B8",
                    backgroundColor: "#FFFFFF",
                    borderRadius: 10,
                    border: "1.5px dashed #CBD5E1",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Package size={22} color="#CBD5E1" />
                  <span>
                    {productSearch ? "No matching products found." : "No products added to catalog yet. Use the form above to add products."}
                  </span>
                </div>
              )}

              {productsList.length > 0 && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => setProductsList([])}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: "11.5px",
                      color: "#EF4444",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "3px 6px",
                      borderRadius: 4,
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#FEE2E2";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <Trash2 size={12} />
                    Clear Catalog ({productsList.length})
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 5. DATA WAREHOUSE NODE FORM (Excel Sheet = WHAT, Google Drive = MEDIA) */}
        {node.type === "data_warehouse" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Warehouse Sub-tabs: Excel vs Google Drive */}
            <div
              style={{
                display: "flex",
                backgroundColor: "#F1F5F9",
                borderRadius: 8,
                padding: 3,
                gap: 4,
              }}
            >
              <button
                type="button"
                onClick={() => setWarehouseTab("excel")}
                style={{
                  flex: 1,
                  padding: "7px 10px",
                  borderRadius: 6,
                  border: "none",
                  backgroundColor: warehouseTab === "excel" ? "#FFFFFF" : "transparent",
                  color: warehouseTab === "excel" ? "#0F172A" : "#64748B",
                  fontWeight: warehouseTab === "excel" ? 700 : 500,
                  fontSize: "12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  boxShadow: warehouseTab === "excel" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <FileSpreadsheet size={14} color={warehouseTab === "excel" ? "#2563EB" : "#64748B"} />
                Excel Sheet
              </button>

              <button
                type="button"
                onClick={() => setWarehouseTab("drive")}
                style={{
                  flex: 1,
                  padding: "7px 10px",
                  borderRadius: 6,
                  border: "none",
                  backgroundColor: warehouseTab === "drive" ? "#FFFFFF" : "transparent",
                  color: warehouseTab === "drive" ? "#0F172A" : "#64748B",
                  fontWeight: warehouseTab === "drive" ? 700 : 500,
                  fontSize: "12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  boxShadow: warehouseTab === "drive" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <HardDrive size={14} color={warehouseTab === "drive" ? "#2563EB" : "#64748B"} />
                Google Drive
              </button>
            </div>

            {/* TAB 1: EXCEL & GOOGLE SHEETS CONFIGURATION (MULTI-SHEET UP TO 10) */}
            {warehouseTab === "excel" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Header Action Banner: Icon Badge + Sheet Count + Add Sheet Button */}
                <div
                  style={{
                    background: "linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)",
                    border: "1px solid #E2E8F0",
                    borderRadius: 12,
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    boxShadow: "0 1px 4px rgba(15, 23, 42, 0.04)",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        background: "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)",
                        border: "1px solid #BFDBFE",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#2563EB",
                        boxShadow: "0 1px 2px rgba(37, 99, 235, 0.12)",
                        flexShrink: 0,
                      }}
                    >
                      <FileSpreadsheet size={18} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A", letterSpacing: "-0.2px" }}>
                          Connected Sheets
                        </span>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 20,
                            background: sheetsList.length >= 10 ? "#FEF3C7" : "#F1F5F9",
                            color: sheetsList.length >= 10 ? "#92400E" : "#475569",
                            border: "1px solid #E2E8F0",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <span
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: "50%",
                              background: sheetsList.length >= 10 ? "#D97706" : "#2563EB",
                            }}
                          />
                          {sheetsList.length}/10 Active
                        </span>
                      </div>
                      <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#64748B", lineHeight: 1.3 }}>
                        Connect multi-sheet pipelines with custom data labels for AI.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={sheetsList.length >= 10}
                    onClick={handleAddSheet}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: "none",
                      background: sheetsList.length >= 10 ? "#E2E8F0" : "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)",
                      color: sheetsList.length >= 10 ? "#94A3B8" : "#FFFFFF",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: sheetsList.length >= 10 ? "not-allowed" : "pointer",
                      boxShadow: sheetsList.length >= 10 ? "none" : "0 2px 6px -1px rgba(37, 99, 235, 0.35)",
                      transition: "all 0.15s ease",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    <Plus size={14} strokeWidth={2.5} />
                    {sheetsList.length >= 10 ? "Max Reached" : "Add Sheet"}
                  </button>
                </div>

                {/* List of Connected Sheets (up to 10) */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {sheetsList.map((sheet, index) => {
                    const isSynced = sheet.excelSyncStatus === "SYNCED" || sheet.excelSyncStatus === "CONNECTED";
                    const isFailed = sheet.excelSyncStatus === "FAILED";

                    return (
                      <div
                        key={sheet.id || index}
                        style={{
                          backgroundColor: "#FFFFFF",
                          border: isSynced ? "1.5px solid #BFDBFE" : isFailed ? "1.5px solid #FECACA" : "1px solid #E2E8F0",
                          borderRadius: 12,
                          boxShadow: isSynced
                            ? "0 4px 14px -3px rgba(37, 99, 235, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)"
                            : "0 2px 8px -2px rgba(15, 23, 42, 0.05), 0 1px 2px rgba(15, 23, 42, 0.03)",
                          overflow: "hidden",
                          transition: "all 0.2s ease",
                        }}
                      >
                        {/* Sheet Card Top Bar */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: 8,
                            padding: "10px 14px",
                            background: isSynced
                              ? "linear-gradient(90deg, #EFF6FF 0%, #FFFFFF 100%)"
                              : "linear-gradient(90deg, #F8FAFC 0%, #FFFFFF 100%)",
                            borderBottom: "1px solid #F1F5F9",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 5,
                                padding: "3px 9px",
                                borderRadius: 20,
                                background: isSynced ? "#EFF6FF" : isFailed ? "#FEE2E2" : "#F1F5F9",
                                border: isSynced ? "1px solid #BFDBFE" : isFailed ? "1px solid #FCA5A5" : "1px solid #E2E8F0",
                                fontSize: "11px",
                                fontWeight: 800,
                                color: isSynced ? "#1D4ED8" : isFailed ? "#B91C1C" : "#475569",
                              }}
                            >
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: "50%",
                                  background: isSynced ? "#2563EB" : isFailed ? "#DC2626" : "#94A3B8",
                                  boxShadow: isSynced ? "0 0 0 2px rgba(37, 99, 235, 0.2)" : "none",
                                }}
                              />
                              Sheet #{index + 1}
                            </div>

                            {sheet.workbookName ? (
                              <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#1E293B", letterSpacing: "-0.1px" }}>
                                {sheet.workbookName}
                              </span>
                            ) : (
                              <span style={{ fontSize: "11.5px", color: "#94A3B8", fontStyle: "italic" }}>
                                Not connected yet
                              </span>
                            )}

                            {isSynced && (
                              <span
                                style={{
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  color: "#1E40AF",
                                  background: "#EFF6FF",
                                  padding: "2px 8px",
                                  borderRadius: 12,
                                  border: "1px solid #DBEAFE",
                                }}
                              >
                                {sheet.totalDataRows || sheet.totalRows || 0} rows synced
                              </span>
                            )}
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {sheet.sheetUrl && (
                              <a
                                href={sheet.sheetUrl.startsWith("http") ? sheet.sheetUrl : `https://${sheet.sheetUrl}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  fontSize: "11px",
                                  color: "#2563EB",
                                  background: "#EFF6FF",
                                  border: "1px solid #DBEAFE",
                                  padding: "4px 9px",
                                  borderRadius: 6,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  textDecoration: "none",
                                  fontWeight: 600,
                                  transition: "all 0.15s ease",
                                }}
                              >
                                <span>Open</span>
                                <ExternalLink size={11} />
                              </a>
                            )}

                            <button
                              type="button"
                              onClick={() => handleRemoveSheet(sheet.id || index)}
                              title="Delete this sheet"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 26,
                                height: 26,
                                borderRadius: 6,
                                border: "1px solid #FEE2E2",
                                background: "#FFF1F2",
                                color: "#E11D48",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                                padding: 0,
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = "#FFE4E6";
                                e.currentTarget.style.borderColor = "#FDA4AF";
                                e.currentTarget.style.color = "#BE123C";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = "#FFF1F2";
                                e.currentTarget.style.borderColor = "#FEE2E2";
                                e.currentTarget.style.color = "#E11D48";
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Sheet Card Body */}
                        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 11 }}>
                          {/* URL Input and Connect Sheet Button */}
                          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                            <div style={{ position: "relative", flex: 1 }}>
                              <div
                                style={{
                                  position: "absolute",
                                  left: 11,
                                  top: "50%",
                                  transform: "translateY(-50%)",
                                  color: isSynced ? "#2563EB" : "#94A3B8",
                                  display: "flex",
                                  alignItems: "center",
                                  pointerEvents: "none",
                                }}
                              >
                                <Link2 size={14} />
                              </div>
                              <input
                                type="url"
                                value={sheet.sheetUrl || ""}
                                onChange={(e) => handleSheetUrlChangeForIndex(sheet.id, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleConnectSheetAtIndex(sheet);
                                  }
                                }}
                                placeholder="Paste Google Sheet URL (https://docs.google.com/spreadsheets/d/...)"
                                style={{
                                  width: "100%",
                                  padding: "9px 12px 9px 34px",
                                  borderRadius: 8,
                                  border: isSynced ? "1.5px solid #BFDBFE" : "1px solid #CBD5E1",
                                  fontSize: "12px",
                                  outline: "none",
                                  backgroundColor: "#FFFFFF",
                                  color: "#0F172A",
                                  transition: "all 0.15s ease",
                                  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)",
                                }}
                                onFocus={(e) => {
                                  e.currentTarget.style.borderColor = "#3B82F6";
                                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.12)";
                                }}
                                onBlur={(e) => {
                                  e.currentTarget.style.borderColor = isSynced ? "#BFDBFE" : "#CBD5E1";
                                  e.currentTarget.style.boxShadow = "inset 0 1px 2px rgba(0,0,0,0.02)";
                                }}
                              />
                            </div>

                            <button
                              type="button"
                              disabled={sheet.isConnecting || !sheet.sheetUrl?.trim()}
                              onClick={() => handleConnectSheetAtIndex(sheet)}
                              style={{
                                padding: "0 16px",
                                borderRadius: 8,
                                border: "none",
                                background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)",
                                color: "#FFFFFF",
                                fontSize: "12px",
                                fontWeight: 700,
                                cursor: sheet.isConnecting || !sheet.sheetUrl?.trim() ? "not-allowed" : "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                opacity: !sheet.sheetUrl?.trim() ? 0.6 : 1,
                                whiteSpace: "nowrap",
                                boxShadow: "0 2px 6px -1px rgba(37, 99, 235, 0.3)",
                                transition: "all 0.15s ease",
                                flexShrink: 0,
                              }}
                            >
                              {sheet.isConnecting ? (
                                <>
                                  <RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} />
                                  Connecting...
                                </>
                              ) : isSynced ? (
                                <>
                                  <CheckCircle2 size={14} />
                                  Re-Sync
                                </>
                              ) : (
                                <>
                                  <Link2 size={14} />
                                  Connect Sheet
                                </>
                              )}
                            </button>
                          </div>

                          {/* Error / Success Feedback */}
                          {sheet.connectError && (
                            <div
                              style={{
                                backgroundColor: "#FEF2F2",
                                border: "1px solid #FECACA",
                                borderRadius: 8,
                                padding: "8px 12px",
                                display: "flex",
                                alignItems: "center",
                                gap: 7,
                                color: "#991B1B",
                                fontSize: "11.5px",
                                lineHeight: 1.4,
                              }}
                            >
                              <AlertCircle size={14} color="#DC2626" style={{ flexShrink: 0 }} />
                              <span>{sheet.connectError}</span>
                            </div>
                          )}
                          {sheet.connectMsg && !sheet.connectError && (
                            <div
                              style={{
                                backgroundColor: "#EFF6FF",
                                border: "1px solid #BFDBFE",
                                borderRadius: 8,
                                padding: "7px 12px",
                                display: "flex",
                                alignItems: "center",
                                gap: 7,
                                color: "#1E40AF",
                                fontSize: "11.5px",
                                lineHeight: 1.4,
                              }}
                            >
                              <CheckCircle2 size={14} color="#2563EB" style={{ flexShrink: 0 }} />
                              <span>{sheet.connectMsg}</span>
                            </div>
                          )}

                          {/* Sheet Data Label Field */}
                          <div>
                            <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, color: "#1E293B", marginBottom: 5 }}>
                              Data Label
                            </label>
                            <textarea
                              rows={2}
                              value={sheet.dataLabels || ""}
                              onChange={(e) => handleUpdateSheetField(sheet.id, { dataLabels: e.target.value })}
                              placeholder="e.g. Meta Ads campaigns & ad sets for Summer Sale 2026, E-commerce Retargeting Creatives, High-intent Lead Gen Ads"
                              style={{
                                width: "100%",
                                padding: "8px 10px",
                                borderRadius: 8,
                                border: "1px solid #CBD5E1",
                                fontSize: "11.5px",
                                outline: "none",
                                backgroundColor: "#FFFFFF",
                                color: "#0F172A",
                                fontFamily: "inherit",
                                lineHeight: 1.4,
                                resize: "vertical",
                                transition: "all 0.15s ease",
                              }}
                              onFocus={(e) => {
                                e.currentTarget.style.borderColor = "#3B82F6";
                                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.12)";
                              }}
                              onBlur={(e) => {
                                e.currentTarget.style.borderColor = "#CBD5E1";
                                e.currentTarget.style.boxShadow = "none";
                              }}
                            />
                          </div>

                          {/* Individual Worksheet Tab Selection Section */}
                          {(isSynced || Boolean(sheet.sheetUrl) || (sheet.availableTabs && sheet.availableTabs.length > 0)) && (
                            <div
                              style={{
                                backgroundColor: "#F8FAFC",
                                border: "1.5px solid #E2E8F0",
                                borderRadius: 10,
                                padding: "12px 12px",
                                display: "flex",
                                flexDirection: "column",
                                gap: 10,
                              }}
                            >
                              {/* Header: Title, Count badge, Select/Deselect All */}
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  flexWrap: "wrap",
                                  gap: 6,
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <Layers size={14} color="#2563EB" />
                                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#0F172A" }}>
                                    Worksheet Tabs
                                  </span>
                                  <span
                                    style={{
                                      fontSize: "10.5px",
                                      fontWeight: 700,
                                      padding: "2px 7px",
                                      borderRadius: 12,
                                      backgroundColor: (sheet.selectedTabIds || []).length > 0 ? "#EFF6FF" : "#FEF2F2",
                                      color: (sheet.selectedTabIds || []).length > 0 ? "#1D4ED8" : "#991B1B",
                                      border: (sheet.selectedTabIds || []).length > 0 ? "1px solid #BFDBFE" : "1px solid #FECACA",
                                    }}
                                  >
                                    {(sheet.selectedTabIds || []).length} of {(sheet.availableTabs || []).length || 1} Selected
                                  </span>
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <button
                                    type="button"
                                    onClick={() => handleSelectAllTabs(sheet.id)}
                                    style={{
                                      background: "none",
                                      border: "none",
                                      padding: 0,
                                      fontSize: "11px",
                                      fontWeight: 700,
                                      color: "#2563EB",
                                      cursor: "pointer",
                                      textDecoration: "underline",
                                    }}
                                  >
                                    Select All
                                  </button>
                                  <span style={{ color: "#CBD5E1", fontSize: "10px" }}>|</span>
                                  <button
                                    type="button"
                                    onClick={() => handleDeselectAllTabs(sheet.id)}
                                    style={{
                                      background: "none",
                                      border: "none",
                                      padding: 0,
                                      fontSize: "11px",
                                      fontWeight: 700,
                                      color: "#64748B",
                                      cursor: "pointer",
                                      textDecoration: "underline",
                                    }}
                                  >
                                    Deselect All
                                  </button>
                                </div>
                              </div>

                              <p style={{ margin: 0, fontSize: "11px", color: "#64748B", lineHeight: 1.35 }}>
                                Check the tabs you want the AI Agent to access. Unchecked tabs will remain private and excluded from AI execution.
                              </p>

                              {/* List of Discovered Tabs */}
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {(sheet.availableTabs && sheet.availableTabs.length > 0 ? sheet.availableTabs : [
                                  { sheetId: 0, title: sheet.worksheetName || "Sheet1", rowCount: sheet.totalRows || 0 }
                                ]).map((tab, tIdx) => {
                                  const tabKey = tab.sheetId !== undefined ? tab.sheetId : tab.title;
                                  const isTabSelected = (sheet.selectedTabIds || []).some(
                                    (sel) => String(sel) === String(tab.sheetId) || String(sel).toLowerCase() === String(tab.title || "").toLowerCase()
                                  );

                                  return (
                                    <div
                                      key={tabKey !== undefined ? String(tabKey) : tIdx}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        padding: "7px 10px",
                                        borderRadius: 8,
                                        backgroundColor: isTabSelected ? "#FFFFFF" : "#F1F5F9",
                                        border: isTabSelected ? "1.5px solid #93C5FD" : "1px solid #E2E8F0",
                                        boxShadow: isTabSelected ? "0 1px 3px rgba(37,99,235,0.06)" : "none",
                                        transition: "all 0.15s ease",
                                      }}
                                    >
                                      <label
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 8,
                                          cursor: "pointer",
                                          userSelect: "none",
                                          minWidth: 0,
                                          flex: 1,
                                        }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isTabSelected}
                                          onChange={() => handleToggleTabSelection(sheet.id, tabKey)}
                                          style={{
                                            width: 15,
                                            height: 15,
                                            accentColor: "#2563EB",
                                            cursor: "pointer",
                                          }}
                                        />
                                        <span
                                          style={{
                                            fontSize: "12px",
                                            fontWeight: isTabSelected ? 700 : 500,
                                            color: isTabSelected ? "#0F172A" : "#64748B",
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                          }}
                                        >
                                          {tab.title}
                                        </span>
                                        {tab.rowCount > 0 && (
                                          <span
                                            style={{
                                              fontSize: "10px",
                                              color: "#64748B",
                                              backgroundColor: "#F1F5F9",
                                              padding: "1px 6px",
                                              borderRadius: 10,
                                            }}
                                          >
                                            {tab.rowCount} rows
                                          </span>
                                        )}
                                      </label>

                                      <button
                                        type="button"
                                        onClick={() => handlePreviewTab(sheet, tab)}
                                        style={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: 4,
                                          padding: "3px 8px",
                                          borderRadius: 6,
                                          border: "1px solid #CBD5E1",
                                          backgroundColor: "#FFFFFF",
                                          fontSize: "11px",
                                          fontWeight: 600,
                                          color: "#334155",
                                          cursor: "pointer",
                                          flexShrink: 0,
                                          transition: "all 0.15s ease",
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.borderColor = "#93C5FD";
                                          e.currentTarget.style.backgroundColor = "#EFF6FF";
                                          e.currentTarget.style.color = "#1D4ED8";
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.borderColor = "#CBD5E1";
                                          e.currentTarget.style.backgroundColor = "#FFFFFF";
                                          e.currentTarget.style.color = "#334155";
                                        }}
                                      >
                                        <Eye size={12} />
                                        <span>Preview Data</span>
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Save Selection Button & Feedback */}
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  flexWrap: "wrap",
                                  gap: 8,
                                  marginTop: 4,
                                }}
                              >
                                <button
                                  type="button"
                                  disabled={sheet.isSavingTabs}
                                  onClick={() => handleSaveTabSelection(sheet.id)}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "7px 14px",
                                    borderRadius: 8,
                                    border: "none",
                                    background: "linear-gradient(135deg, #1D4ED8 0%, #1E40AF 100%)",
                                    color: "#FFFFFF",
                                    fontSize: "11.5px",
                                    fontWeight: 700,
                                    cursor: sheet.isSavingTabs ? "not-allowed" : "pointer",
                                    boxShadow: "0 1px 4px rgba(29, 78, 216, 0.25)",
                                    transition: "all 0.15s ease",
                                  }}
                                >
                                  {sheet.isSavingTabs ? (
                                    <>
                                      <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} />
                                      Saving Selection...
                                    </>
                                  ) : (
                                    <>
                                      <Check size={13} strokeWidth={2.5} />
                                      Save Selection
                                    </>
                                  )}
                                </button>

                                {sheet.saveTabsMsg && (
                                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#059669", display: "inline-flex", alignItems: "center", gap: 4 }}>
                                    <CheckCircle2 size={13} color="#059669" />
                                    {sheet.saveTabsMsg}
                                  </span>
                                )}
                                {sheet.hasUnsavedTabChanges && !sheet.saveTabsMsg && (
                                  <span style={{ fontSize: "11px", fontWeight: 600, color: "#D97706" }}>
                                    Unsaved selection changes
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 2: GOOGLE DRIVE & SHEETS OAUTH CONFIGURATION */}
            {warehouseTab === "drive" && (() => {
              const isConnected = Boolean(driveOAuthStatus?.connected);
              const displayEmail = driveOAuthStatus?.email || (isConnected ? googleDriveEmail : "");

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Connection Status Card */}
                  <div
                    style={{
                      backgroundColor: isConnected ? "#EFF6FF" : "#F8FAFC",
                      border: isConnected ? "1.5px solid #BFDBFE" : "1px solid #E2E8F0",
                      borderRadius: 10,
                      padding: "14px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            backgroundColor: isConnected ? "#DBEAFE" : "#E2E8F0",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <HardDrive size={18} color={isConnected ? "#2563EB" : "#64748B"} />
                        </div>
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 700, color: "#0F172A" }}>
                            {isConnected ? "Google Account Connected" : "Google Account Not Connected"}
                          </div>
                          <div style={{ fontSize: "11px", color: "#64748B" }}>
                            {isConnected
                              ? displayEmail || "Ready to fetch video creatives and campaign sheets"
                              : "Sign in with Google so the AI Agent can access your campaign videos & sheet."}
                          </div>
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: 12,
                          backgroundColor: isConnected ? "#DBEAFE" : "#F1F5F9",
                          color: isConnected ? "#1D4ED8" : "#64748B",
                        }}
                      >
                        {isConnected ? "Active OAuth" : "Offline"}
                      </span>
                    </div>

                    {/* Connected Gmail Account Display (Shown when connected) */}
                    {isConnected && (
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#1E40AF",
                          backgroundColor: "#FFFFFF",
                          borderRadius: 8,
                          padding: "10px 12px",
                          border: "1px solid #BFDBFE",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 6,
                              backgroundColor: "#EFF6FF",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Mail size={15} color="#2563EB" />
                          </div>
                          <div>
                            <span style={{ fontSize: "10.5px", color: "#64748B", display: "block" }}>
                              Connected Gmail Account
                            </span>
                            <strong style={{ fontSize: "12.5px", color: "#0F172A", fontFamily: "monospace" }}>
                              {displayEmail || "Google Account Connected"}
                            </strong>
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: "10.5px",
                            fontWeight: 700,
                            backgroundColor: "#DCFCE7",
                            color: "#15803D",
                            padding: "2px 8px",
                            borderRadius: 10,
                          }}
                        >
                          Verified
                        </span>
                      </div>
                    )}

                    {/* OAuth Action Buttons */}
                    <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                      <button
                        type="button"
                        disabled={isInitiatingDriveOAuth}
                        onClick={handleInitiateGoogleDriveOAuth}
                        style={{
                          flex: 1,
                          padding: "9px 14px",
                          borderRadius: 7,
                          border: "none",
                          backgroundColor: "#2563EB",
                          color: "#FFFFFF",
                          fontSize: "12px",
                          fontWeight: 700,
                          cursor: isInitiatingDriveOAuth ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          boxShadow: "0 1px 3px rgba(37,99,235,0.2)",
                        }}
                      >
                        {isInitiatingDriveOAuth ? (
                          <>
                            <RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Key size={13} />
                            {isConnected ? "Re-authenticate with Google" : "Sign in with Google"}
                          </>
                        )}
                      </button>

                      {isConnected && (
                        <button
                          type="button"
                          onClick={handleDisconnectDrive}
                          style={{
                            padding: "9px 12px",
                            borderRadius: 7,
                            border: "1px solid #FECACA",
                            backgroundColor: "#FEF2F2",
                            color: "#DC2626",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <LogOut size={13} /> Disconnect
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Error Banner */}
                  {driveConnectError && (
                    <div
                      style={{
                        backgroundColor: "#FEF2F2",
                        border: "1px solid #FECACA",
                        borderRadius: 8,
                        padding: "10px 12px",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 8,
                        color: "#991B1B",
                        fontSize: "12px",
                        lineHeight: 1.45,
                      }}
                    >
                      <AlertCircle size={16} color="#DC2626" style={{ marginTop: 2, flexShrink: 0 }} />
                      <div>
                        <strong>Drive Error:</strong> {driveConnectError}
                      </div>
                    </div>
                  )}

                  {/* Success Banner */}
                  {driveConnectMsg && (
                    <div
                      style={{
                        backgroundColor: "#EFF6FF",
                        border: "1px solid #BFDBFE",
                        borderRadius: 8,
                        padding: "10px 12px",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        color: "#1E40AF",
                        fontSize: "12px",
                      }}
                    >
                      <CheckCircle2 size={16} color="#2563EB" />
                      <span>{driveConnectMsg}</span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Bottom Save & Delete Action Buttons */}
        <div style={{ marginTop: "auto", paddingTop: 16, display: "flex", gap: 10 }}>
          <button
            type="submit"
            disabled={isSaving}
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 8,
              border: "none",
              backgroundColor: savedBadge ? "#10B981" : isSaving ? "#334155" : "#0F172A",
              color: "#FFFFFF",
              fontSize: "12.5px",
              fontWeight: 600,
              cursor: isSaving ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              boxShadow: "0 1px 3px rgba(15, 23, 42, 0.12)",
              transition: "all 0.15s ease",
            }}
          >
            {isSaving ? (
              <>
                <RefreshCw size={15} style={{ animation: "spin 1s linear infinite" }} />
                Saving to Database...
              </>
            ) : savedBadge ? (
              <>
                <Check size={16} />
                Saved to Canvas & Database!
              </>
            ) : (
              "Save Node Details"
            )}
          </button>

          {!node.isRoot && (
            <button
              type="button"
              onClick={() => onDelete(node.id)}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #FECACA",
                backgroundColor: "#FEF2F2",
                color: "#DC2626",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Delete this node from workflow"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </form>

      {/* DATA PREVIEW MODAL */}
      {previewModalData?.open && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
            padding: 16,
            backdropFilter: "blur(3px)",
          }}
          onClick={() => setPreviewModalData(null)}
        >
          <div
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 14,
              maxWidth: 780,
              width: "100%",
              maxHeight: "82vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 20px",
                borderBottom: "1px solid #E2E8F0",
                backgroundColor: "#F8FAFC",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <FileSpreadsheet size={19} color="#2563EB" />
                <span style={{ fontSize: "14px", fontWeight: 700, color: "#0F172A" }}>
                  Worksheet Preview: {previewModalData.title}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    padding: "2px 8px",
                    borderRadius: 12,
                    backgroundColor: "#EFF6FF",
                    color: "#1D4ED8",
                    fontWeight: 600,
                    border: "1px solid #DBEAFE",
                  }}
                >
                  Tab ID: {previewModalData.sheetId}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setPreviewModalData(null)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#64748B",
                  padding: 4,
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "16px 20px", overflow: "auto", flex: 1 }}>
              {previewModalData.isLoading ? (
                <div style={{ padding: "40px 0", textAlign: "center", color: "#64748B" }}>
                  <RefreshCw size={26} style={{ animation: "spin 1s linear infinite", margin: "0 auto 10px" }} />
                  <p style={{ margin: 0, fontSize: "12.5px", fontWeight: 600 }}>Loading tab data from Google Sheets...</p>
                </div>
              ) : previewModalData.error ? (
                <div style={{ backgroundColor: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: 14, color: "#991B1B", fontSize: "12px" }}>
                  {previewModalData.error}
                </div>
              ) : previewModalData.rows?.length === 0 ? (
                <div style={{ padding: "35px 0", textAlign: "center", color: "#64748B", fontSize: "12.5px" }}>
                  No rows found in worksheet tab "{previewModalData.title}".
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: 12, fontSize: "12px", color: "#64748B", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>Showing first {Math.min(10, previewModalData.rows.length)} rows</span>
                    <span style={{ fontWeight: 600, color: "#1E293B" }}>Total rows: {previewModalData.totalRows || previewModalData.rows.length}</span>
                  </div>
                  <div style={{ overflowX: "auto", border: "1px solid #E2E8F0", borderRadius: 8, maxHeight: "50vh" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px", textAlign: "left" }}>
                      <thead>
                        <tr style={{ backgroundColor: "#F8FAFC", borderBottom: "1.5px solid #CBD5E1", position: "sticky", top: 0 }}>
                          {(previewModalData.headers || []).map((h, i) => (
                            <th key={i} style={{ padding: "8px 12px", fontWeight: 700, color: "#0F172A", whiteSpace: "nowrap" }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(previewModalData.rows || []).slice(0, 10).map((r, rIdx) => (
                          <tr key={rIdx} style={{ borderBottom: "1px solid #F1F5F9", backgroundColor: rIdx % 2 === 0 ? "#FFFFFF" : "#F8FAFC" }}>
                            {(previewModalData.headers || []).map((h, cIdx) => (
                              <td key={cIdx} style={{ padding: "7px 12px", color: "#334155", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {String(r[h] !== undefined ? r[h] : (r[`col_${cIdx}`] !== undefined ? r[`col_${cIdx}`] : "-"))}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "12px 20px",
                borderTop: "1px solid #E2E8F0",
                backgroundColor: "#F8FAFC",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={() => setPreviewModalData(null)}
                style={{
                  padding: "7px 16px",
                  borderRadius: 7,
                  border: "1px solid #CBD5E1",
                  backgroundColor: "#FFFFFF",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  color: "#334155",
                }}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.aside>
  );
};

export default NodeDetailDrawer;
