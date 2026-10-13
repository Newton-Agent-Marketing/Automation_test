import { useState, useEffect, useMemo } from "react";
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
  const [briefMetrics, setBriefMetrics] = useState("");
  const [briefKpis, setBriefKpis] = useState("");
  const [briefDescription, setBriefDescription] = useState("");

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
    setBriefMetrics(node.data?.metrics || "");
    setBriefKpis(node.data?.kpis || "");
    setBriefDescription(node.data?.description || "");

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
      const matchedAccount = matchingAccounts.find(a => String(a.accountId).trim() === String(adAccountId).trim());
      const accName = matchedAccount?.accountName || matchedAccount?.name;
      nodeLabel = channelName.trim() || "Ad Channel";
      nodeSubtitle = adAccountId
        ? (accName ? `${accName}` : `Account: ${adAccountId}`)
        : `Funnel: ${funnelEvent}`;
      dataPayload = {
        ...dataPayload,
        name: channelName.trim(),
        channelName: channelName.trim(),
        channel: channelName.trim(),
        adAccountId: adAccountId.trim(),
        accountName: accName || "",
        funnelEvent: funnelEvent.trim(),
        funnelDescription: funnelDescription.trim(),
      };
    } else if (node.type === "marketing_brief") {
      nodeLabel = "Marketing Brief";
      nodeSubtitle = briefKpis ? `KPIs: ${briefKpis.slice(0, 35)}` : (briefMetrics ? `Metrics: ${briefMetrics.slice(0, 35)}` : "Campaign Strategy");
      dataPayload = {
        ...dataPayload,
        name: "Marketing Brief",
        metrics: briefMetrics.trim(),
        kpis: briefKpis.trim(),
        description: briefDescription.trim(),
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
      const displayTitle = workbookName || (sheetUrl ? "Connected Google Sheet" : "Excel & Drive Warehouse");
      nodeLabel = `${displayTitle} (${excelProvider})`;
      nodeSubtitle = sheetUrl ? `🔗 ${sheetUrl.slice(0, 38)}...` : `Sheet: ${worksheetName || "Active"} • Drive: ${googleDriveEmail ? "Connected" : "Linked"}`;
      dataPayload = {
        ...dataPayload,
        warehouseSource: "both",
        sheetUrl: sheetUrl.trim(),
        excelProvider,
        workbookName: workbookName.trim(),
        worksheetName: worksheetName.trim(),
        excelSyncStatus,
        googleDriveConnected,
        googleDriveEmail: googleDriveEmail.trim(),
        googleDriveFolderName: googleDriveFolder.trim(),
        dataLevel: dataLabels.trim(),
        dataLabels: dataLabels.trim(),
        databasePlatform: "Excel Sheet & Google Drive",
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
          <span style={{ color: node.previousNodeLabel ? "#2563EB" : "#16A34A", fontWeight: 700 }}>
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
                          border: isSelected ? "1.5px solid #0081FB" : "1px solid #E2E8F0",
                          backgroundColor: isSelected ? "#EFF6FF" : "#F8FAFC",
                          color: isSelected ? "#0081FB" : "#475569",
                          fontSize: "12px",
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <CheckCircle2 size={13} color={isSelected ? "#0081FB" : "#94A3B8"} />
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
                    backgroundColor: "#FFFBEB",
                    border: "1px solid #FDE68A",
                    color: "#B45309",
                    fontSize: "11.5px",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 8,
                  }}
                >
                  <AlertCircle size={14} />
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
                            border: isSelected ? "1.5px solid #0081FB" : "1px solid #E2E8F0",
                            backgroundColor: isSelected ? "#F0F9FF" : "#FFFFFF",
                            color: "#1E293B",
                            fontSize: "12px",
                            textAlign: "left",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                            gap: 8,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
                            <CheckCircle2 size={14} color={isSelected ? "#0081FB" : "#CBD5E1"} style={{ flexShrink: 0 }} />
                            <div style={{ minWidth: 0 }}>
                              <span style={{ fontWeight: isSelected ? 700 : 500, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {acc.accountName || acc.name || "Ad Account"}
                              </span>
                              {acc.isManager && (
                                <span style={{ fontSize: "9.5px", color: "#6366F1", fontWeight: 600 }}>
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
                                color: isSelected ? "#0081FB" : "#64748B",
                                backgroundColor: isSelected ? "#E0F2FE" : "#F1F5F9",
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

            <div style={{ backgroundColor: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: 10, padding: "12px", display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#0369A1", textTransform: "uppercase" }}>
                Funnel Event Settings
              </span>
              <div>
                <label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "#0C4A6E", marginBottom: 4 }}>
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
                    border: "1px solid #7DD3FC",
                    fontSize: "12px",
                    backgroundColor: "#FFFFFF",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "#0C4A6E", marginBottom: 4 }}>
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
                    border: "1px solid #7DD3FC",
                    fontSize: "12px",
                    backgroundColor: "#FFFFFF",
                    fontFamily: "inherit",
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* 3. MARKETING BRIEF NODE FORM */}
        {node.type === "marketing_brief" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#1E293B", marginBottom: 5 }}>
                KPIs (In Text)
              </label>
              <textarea
                rows={3}
                value={briefKpis}
                onChange={(e) => setBriefKpis(e.target.value)}
                placeholder="e.g. Cost Per Acquisition, Conversion Rate, Total Sales Volume, Retention Rate"
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
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#1E293B", marginBottom: 5 }}>
                Strategy & Target Audience Notes
              </label>
              <textarea
                rows={3}
                value={briefDescription}
                onChange={(e) => setBriefDescription(e.target.value)}
                placeholder="Core campaign guidelines, audience target, hooks and value props for AI Agent..."
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
            <div style={{ backgroundColor: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "12px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#15803D", marginBottom: 8 }}>
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
                    style={{ width: 16, height: 16, accentColor: "#16A34A", cursor: "pointer" }}
                  />
                  <Smartphone size={15} color="#16A34A" />
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
                    style={{ width: 16, height: 16, accentColor: "#16A34A", cursor: "pointer" }}
                  />
                  <Globe size={15} color="#16A34A" />
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
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ShoppingBag size={16} color="#059669" />
                  <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#0F172A" }}>
                    Product Catalog
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      backgroundColor: "#DCFCE7",
                      color: "#15803D",
                      padding: "2px 8px",
                      borderRadius: 12,
                    }}
                  >
                    {productsList.length} Items
                  </span>
                </div>

                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setShowBulkPaste(!showBulkPaste)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: "11.5px",
                      fontWeight: 600,
                      color: "#2563EB",
                      background: "#EFF6FF",
                      border: "1px solid #BFDBFE",
                      borderRadius: 6,
                      padding: "4px 8px",
                      cursor: "pointer",
                    }}
                  >
                    <UploadCloud size={13} />
                    {showBulkPaste ? "Hide Import" : "Bulk Paste"}
                  </button>

                  {productsList.length === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const sampleProds = Array.from({ length: 5 }, (_, i) => ({
                          id: `prod_sample_${i + 1}`,
                          name: `Pro Model Alpha ${i + 1}`,
                          price: `₹${(i + 1) * 999}`,
                          sku: `SKU-PROD-${100 + i}`,
                          category: "Electronics",
                          url: `https://myshop.com/p/${i + 1}`,
                          platforms: ["Web"],
                          createdAt: new Date().toISOString(),
                        }));
                        setProductsList(sampleProds);
                      }}
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#64748B",
                        background: "#F1F5F9",
                        border: "1px solid #E2E8F0",
                        borderRadius: 6,
                        padding: "4px 8px",
                        cursor: "pointer",
                      }}
                    >
                      + Load Sample
                    </button>
                  )}
                </div>
              </div>

              {/* Bulk Paste / CSV Input Section */}
              {showBulkPaste && (
                <div
                  style={{
                    backgroundColor: "#FFFFFF",
                    border: "1px solid #CBD5E1",
                    borderRadius: 8,
                    padding: "10px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "#475569" }}>
                    Paste multiple products (1 item per line: <em>Name, Price, URL, Category, SKU</em>):
                  </span>
                  <textarea
                    rows={4}
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder={"AirPods Pro 2, ₹24900, https://shop.com/airpods, Audio, SKU-001\nMacBook Air M3, ₹114900, https://shop.com/macbook, Laptops, SKU-002"}
                    style={{
                      width: "100%",
                      padding: "8px",
                      fontSize: "11.5px",
                      fontFamily: "monospace",
                      borderRadius: 6,
                      border: "1px solid #E2E8F0",
                      outline: "none",
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setShowBulkPaste(false)}
                      style={{
                        padding: "4px 10px",
                        fontSize: "11px",
                        color: "#64748B",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkAddProducts}
                      style={{
                        padding: "5px 12px",
                        fontSize: "11.5px",
                        fontWeight: 600,
                        backgroundColor: "#059669",
                        color: "#FFFFFF",
                        border: "none",
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      Add Pasted Products
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Add Form */}
              <div
                style={{
                  backgroundColor: "#FFFFFF",
                  border: "1px solid #E2E8F0",
                  borderRadius: 8,
                  padding: "10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#334155" }}>
                  Quick Add Product
                </span>
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 6 }}>
                  <input
                    type="text"
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    placeholder="Product Name *"
                    style={{
                      padding: "7px 9px",
                      fontSize: "12px",
                      border: "1px solid #CBD5E1",
                      borderRadius: 6,
                    }}
                  />
                  <input
                    type="text"
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(e.target.value)}
                    placeholder="Price (e.g. ₹999)"
                    style={{
                      padding: "7px 9px",
                      fontSize: "12px",
                      border: "1px solid #CBD5E1",
                      borderRadius: 6,
                    }}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <input
                    type="text"
                    value={newProdSku}
                    onChange={(e) => setNewProdSku(e.target.value)}
                    placeholder="SKU Code"
                    style={{
                      padding: "7px 9px",
                      fontSize: "12px",
                      border: "1px solid #CBD5E1",
                      borderRadius: 6,
                    }}
                  />
                  <input
                    type="text"
                    value={newProdCategory}
                    onChange={(e) => setNewProdCategory(e.target.value)}
                    placeholder="Category"
                    style={{
                      padding: "7px 9px",
                      fontSize: "12px",
                      border: "1px solid #CBD5E1",
                      borderRadius: 6,
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="url"
                    value={newProdUrl}
                    onChange={(e) => setNewProdUrl(e.target.value)}
                    placeholder="Product URL (https://...)"
                    style={{
                      flex: 1,
                      padding: "7px 9px",
                      fontSize: "12px",
                      border: "1px solid #CBD5E1",
                      borderRadius: 6,
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddSingleProduct}
                    disabled={!newProdName.trim()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "7px 14px",
                      fontSize: "12px",
                      fontWeight: 600,
                      backgroundColor: newProdName.trim() ? "#059669" : "#94A3B8",
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: 6,
                      cursor: newProdName.trim() ? "pointer" : "not-allowed",
                    }}
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>

              {/* Search Bar for 100+ Catalog Navigation */}
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
                    placeholder={`Search among ${productsList.length} products (by name, SKU, category)...`}
                    style={{
                      width: "100%",
                      padding: "7px 10px 7px 32px",
                      fontSize: "12px",
                      border: "1px solid #CBD5E1",
                      borderRadius: 6,
                      backgroundColor: "#FFFFFF",
                    }}
                  />
                </div>
              )}

              {/* Product List Scrollable View */}
              {filteredProducts.length > 0 ? (
                <div
                  style={{
                    maxHeight: 240,
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    paddingRight: 2,
                  }}
                >
                  {filteredProducts.map((p, idx) => (
                    <div
                      key={p.id || idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 10px",
                        backgroundColor: "#FFFFFF",
                        border: "1px solid #E2E8F0",
                        borderRadius: 8,
                        fontSize: "12px",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                          <strong
                            style={{
                              color: "#0F172A",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {p.name}
                          </strong>
                          {p.price && (
                            <span
                              style={{
                                fontSize: "10.5px",
                                fontWeight: 700,
                                color: "#059669",
                                backgroundColor: "#ECFDF5",
                                padding: "1px 5px",
                                borderRadius: 4,
                              }}
                            >
                              {p.price}
                            </span>
                          )}
                          {p.category && (
                            <span
                              style={{
                                fontSize: "10px",
                                color: "#64748B",
                                backgroundColor: "#F1F5F9",
                                padding: "1px 5px",
                                borderRadius: 4,
                              }}
                            >
                              {p.category}
                            </span>
                          )}
                        </div>
                        {(p.sku || p.url) && (
                          <div
                            style={{
                              fontSize: "10.5px",
                              color: "#94A3B8",
                              marginTop: 2,
                              display: "flex",
                              gap: 8,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {p.sku && <span>SKU: {p.sku}</span>}
                            {p.url && <span>URL: {p.url}</span>}
                          </div>
                        )}
                      </div>

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
                          marginLeft: 6,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "#EF4444")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "#94A3B8")}
                        title="Remove product from catalog"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    padding: "14px",
                    textAlign: "center",
                    fontSize: "11.5px",
                    color: "#94A3B8",
                    backgroundColor: "#FFFFFF",
                    borderRadius: 8,
                    border: "1px dashed #CBD5E1",
                  }}
                >
                  {productSearch ? "No matching products found." : "No products added to this context yet."}
                </div>
              )}

              {productsList.length > 0 && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => setProductsList([])}
                    style={{
                      fontSize: "11px",
                      color: "#EF4444",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "2px",
                    }}
                  >
                    Clear All Products ({productsList.length})
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
                <FileSpreadsheet size={14} color={warehouseTab === "excel" ? "#16A34A" : "#64748B"} />
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

            {/* TAB 1: EXCEL SHEET CONFIGURATION */}
            {warehouseTab === "excel" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Primary Sheet URL Input & Connect Button */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <label style={{ fontSize: "12.5px", fontWeight: 700, color: "#0F172A" }}>
                      Google Sheet / Cloud Excel Link URL <span style={{ color: "#EF4444" }}>*</span>
                    </label>
                    {sheetUrl && (
                      <a
                        href={sheetUrl.startsWith("http") ? sheetUrl : `https://${sheetUrl}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: "11px",
                          color: "#2563EB",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                          textDecoration: "none",
                          fontWeight: 600,
                        }}
                      >
                        Open Sheet <ExternalLink size={11} />
                      </a>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="url"
                      value={sheetUrl}
                      onChange={(e) => handleSheetUrlChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleConnectSheetClick();
                        }
                      }}
                      placeholder="Paste Google Sheet URL (e.g. https://docs.google.com/spreadsheets/d/...)"
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: excelSyncStatus === "CONNECTED" ? "1.5px solid #16A34A" : "1px solid #CBD5E1",
                        fontSize: "12.5px",
                        outline: "none",
                        backgroundColor: "#FFFFFF",
                        fontFamily: "monospace",
                      }}
                    />
                    <button
                      type="button"
                      disabled={isConnectingSheet || isSyncingSheet || !sheetUrl.trim()}
                      onClick={excelSyncStatus === "CONNECTED" || excelSyncStatus === "SYNCED" ? handleSyncSheetClick : handleConnectSheetClick}
                      style={{
                        padding: "10px 16px",
                        borderRadius: 8,
                        border: "none",
                        backgroundColor: (excelSyncStatus === "CONNECTED" || excelSyncStatus === "SYNCED") ? "#16A34A" : "#2563EB",
                        color: "#FFFFFF",
                        fontSize: "12.5px",
                        fontWeight: 700,
                        cursor: isConnectingSheet || isSyncingSheet || !sheetUrl.trim() ? "not-allowed" : "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        opacity: !sheetUrl.trim() ? 0.6 : 1,
                        whiteSpace: "nowrap",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                        transition: "all 0.2s ease",
                      }}
                    >
                      {isConnectingSheet ? (
                        <>
                          <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />
                          Connecting...
                        </>
                      ) : isSyncingSheet ? (
                        <>
                          <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />
                          Syncing...
                        </>
                      ) : (excelSyncStatus === "CONNECTED" || excelSyncStatus === "SYNCED") ? (
                        <>
                          <RefreshCw size={14} />
                          Re-Sync Sheet
                        </>
                      ) : (
                        <>
                          <Link2 size={15} />
                          Connect Sheet
                        </>
                      )}
                    </button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                    <span style={{ fontSize: "11px", color: "#64748B" }}>
                      Paste Google Sheet URL link or upload an Excel file (.xlsx, .xls) directly:
                    </span>
                    <label
                      style={{
                        padding: "5px 10px",
                        borderRadius: 6,
                        backgroundColor: "#F1F5F9",
                        border: "1px solid #CBD5E1",
                        fontSize: "11.5px",
                        fontWeight: 600,
                        color: "#0F172A",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <UploadCloud size={13} color="#2563EB" />
                      Upload Excel File
                      <input
                        type="file"
                        accept=".xlsx, .xls"
                        onChange={handleExcelFileUpload}
                        style={{ display: "none" }}
                      />
                    </label>
                  </div>
                </div>

                {/* Data Labels (Sheet Data Description & Purpose for AI Agent) */}
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#1E293B", marginBottom: 4 }}>
                    Data Labels (Sheet Data Description & Purpose)
                  </label>
                  <span style={{ fontSize: "11px", color: "#64748B", display: "block", marginBottom: 6 }}>
                    Specify what kind of campaign data is in this sheet so the AI Agent understands its business context and purpose.
                  </span>
                  <textarea
                    rows={3}
                    value={dataLabels}
                    onChange={(e) => setDataLabels(e.target.value)}
                    placeholder="e.g. Meta Ads campaigns & ad sets for Summer Sale 2026, E-commerce Retargeting Creatives, High-intent Lead Gen Ads"
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: 8,
                      border: "1px solid #CBD5E1",
                      fontSize: "12px",
                      outline: "none",
                      backgroundColor: "#FFFFFF",
                      fontFamily: "inherit",
                      lineHeight: 1.45,
                    }}
                  />
                </div>

                {/* Connection Error Message */}
                {sheetConnectError && (
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
                      <strong>Connection Failed:</strong> {sheetConnectError}
                    </div>
                  </div>
                )}

                {/* Connected Success / Sync Card with Live Stats & Sync Now */}
                {(excelSyncStatus === "CONNECTED" || excelSyncStatus === "SYNCED" || excelSyncStatus === "SYNCING" || excelSyncStatus === "FAILED" || (node.data?.sheetUrl && sheetUrl)) && (
                  <div
                    style={{
                      backgroundColor: excelSyncStatus === "FAILED" ? "#FEF2F2" : "#F0FDF4",
                      border: excelSyncStatus === "FAILED" ? "1px solid #FECACA" : "1px solid #BBF7D0",
                      borderRadius: 10,
                      padding: "14px 16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {/* Header Row: Connection info + Sync Status + Manual Sync Now Button */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {excelSyncStatus === "FAILED" ? (
                          <AlertCircle size={18} color="#DC2626" />
                        ) : isSyncingSheet ? (
                          <RefreshCw size={18} color="#D97706" style={{ animation: "spin 1s linear infinite" }} />
                        ) : (
                          <CheckCircle2 size={18} color="#16A34A" />
                        )}
                        <div>
                          <div style={{ fontWeight: 700, color: excelSyncStatus === "FAILED" ? "#991B1B" : "#166534", fontSize: "13px" }}>
                            {workbookName || "Google Spreadsheet"}
                          </div>
                          <div style={{ fontSize: "11px", color: "#64748B" }}>
                            Worksheet: <strong>{worksheetName || "Sheet1"}</strong> • Provider: {excelProvider}
                          </div>
                        </div>
                      </div>

                      {/* Sync Action Button */}
                      <button
                        type="button"
                        disabled={isSyncingSheet || !sheetUrl.trim()}
                        onClick={handleSyncSheetClick}
                        title="Fetch latest rows and updates directly from Google Sheets"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "6px 12px",
                          borderRadius: 6,
                          border: excelSyncStatus === "FAILED" ? "1px solid #FCA5A5" : "1px solid #86EFAC",
                          backgroundColor: excelSyncStatus === "FAILED" ? "#FEE2E2" : "#FFFFFF",
                          color: excelSyncStatus === "FAILED" ? "#B91C1C" : "#15803D",
                          fontSize: "11.5px",
                          fontWeight: 700,
                          cursor: isSyncingSheet ? "not-allowed" : "pointer",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <RefreshCw size={12} style={isSyncingSheet ? { animation: "spin 1s linear infinite" } : {}} />
                        {isSyncingSheet ? "Syncing..." : excelSyncStatus === "FAILED" ? "Retry Sync" : "Sync Now"}
                      </button>
                    </div>

                    {/* Live Row Sync Stats Pill Badges */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", paddingTop: 2 }}>
                      <span
                        title={`Total data rows: ${sheetStats.totalDataRows || sheetStats.totalRows || 0} (Rows 2–${sheetStats.lastRowNumber || (sheetStats.totalSheetRows || 9)})`}
                        style={{
                          backgroundColor: "#DCFCE7",
                          color: "#15803D",
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: 6,
                        }}
                      >
                        📊 {sheetStats.totalDataRows || sheetStats.totalRows || node.data?.totalDataRows || node.data?.totalRows || 0} Data Rows (Rows 2–{sheetStats.lastRowNumber || node.data?.lastRowNumber || (sheetStats.totalSheetRows || 9)})
                      </span>

                      <span
                        title="Total populated sheet rows in worksheet including Header row 1"
                        style={{
                          backgroundColor: "#F1F5F9",
                          color: "#334155",
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: 6,
                          border: "1px solid #E2E8F0",
                        }}
                      >
                        📋 {sheetStats.totalSheetRows || node.data?.totalSheetRows || ((sheetStats.totalDataRows || sheetStats.totalRows || 0) + 1)} Sheet Rows (Row 1 Header)
                      </span>

                      <span
                        title="Rows with valid landing page URL and creative ad copy meeting Meta requirements"
                        style={{
                          backgroundColor: "#E0F2FE",
                          color: "#0369A1",
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: 6,
                        }}
                      >
                        ✅ {sheetStats.eligibleAdRowsCount ?? sheetStats.readyRowsCount ?? node.data?.eligibleAdRowsCount ?? node.data?.readyRowsCount ?? 0} Eligible for Ads
                      </span>

                      {(sheetStats.validationErrorRowsCount > 0 || node.data?.validationErrorRowsCount > 0) && (
                        <span
                          title="Rows requiring corrections (e.g., missing landing page URL or missing ad copy)"
                          style={{
                            backgroundColor: "#FEE2E2",
                            color: "#B91C1C",
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: 6,
                          }}
                        >
                          ⚠️ {sheetStats.validationErrorRowsCount || node.data?.validationErrorRowsCount || 0} Require Correction
                        </span>
                      )}

                      {sheetStats.newRowsCount > 0 && (
                        <span
                          style={{
                            backgroundColor: "#E0E7FF",
                            color: "#3730A3",
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: 6,
                          }}
                        >
                          ✨ +{sheetStats.newRowsCount} New Rows {sheetStats.newRowNumbers?.length > 0 ? `(${sheetStats.newRowNumbers.join(", ")})` : ""}
                        </span>
                      )}

                      {sheetStats.updatedRowsCount > 0 && (
                        <span
                          style={{
                            backgroundColor: "#FEF3C7",
                            color: "#92400E",
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: 6,
                          }}
                        >
                          🔄 +{sheetStats.updatedRowsCount} Updated Rows {sheetStats.updatedRowNumbers?.length > 0 ? `(${sheetStats.updatedRowNumbers.join(", ")})` : ""}
                        </span>
                      )}

                      {sheetStats.blankRowsCount > 0 && (
                        <span
                          style={{
                            backgroundColor: "#F8FAFC",
                            color: "#64748B",
                            fontSize: "11px",
                            fontWeight: 600,
                            padding: "3px 8px",
                            borderRadius: 6,
                            border: "1px dashed #CBD5E1",
                          }}
                        >
                          ⚪ {sheetStats.blankRowsCount} Blank Skipped
                        </span>
                      )}

                      <span style={{ fontSize: "11px", color: "#64748B", marginLeft: "auto" }}>
                        🕒 Last Synced: {sheetStats.lastSyncedAt ? new Date(sheetStats.lastSyncedAt).toLocaleTimeString() : "Pending"}
                      </span>
                    </div>

                    {sheetConnectMsg && (
                      <div style={{ fontSize: "11.5px", color: excelSyncStatus === "FAILED" ? "#991B1B" : "#15803D", lineHeight: 1.4 }}>
                        {sheetConnectMsg}
                      </div>
                    )}

                    {/* Columns Badges */}
                    {Array.isArray(sheetStats.columns) && sheetStats.columns.length > 0 && (
                      <div style={{ borderTop: "1px dashed #BBF7D0", paddingTop: 8, marginTop: 2 }}>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "#166534", marginBottom: 5 }}>
                          Detected Column Schema ({sheetStats.columns.length}):
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {sheetStats.columns.slice(0, 10).map((col, idx) => (
                            <span
                              key={idx}
                              style={{
                                backgroundColor: "#FFFFFF",
                                border: "1px solid #86EFAC",
                                color: "#166534",
                                fontSize: "10.5px",
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontFamily: "monospace",
                              }}
                            >
                              {col}
                            </span>
                          ))}
                          {sheetStats.columns.length > 10 && (
                            <span style={{ fontSize: "10.5px", color: "#15803D", padding: "2px 4px" }}>
                              +{sheetStats.columns.length - 10} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
                      backgroundColor: isConnected ? "#F0FDF4" : "#F8FAFC",
                      border: isConnected ? "1.5px solid #86EFAC" : "1px solid #E2E8F0",
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
                            backgroundColor: isConnected ? "#DCFCE7" : "#E2E8F0",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <HardDrive size={18} color={isConnected ? "#16A34A" : "#64748B"} />
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
                          backgroundColor: isConnected ? "#DCFCE7" : "#F1F5F9",
                          color: isConnected ? "#15803D" : "#64748B",
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
                          color: "#166534",
                          backgroundColor: "#FFFFFF",
                          borderRadius: 8,
                          padding: "10px 12px",
                          border: "1px solid #BBF7D0",
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
                              backgroundColor: "#DCFCE7",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Mail size={15} color="#16A34A" />
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
                        backgroundColor: "#F0FDF4",
                        border: "1px solid #BBF7D0",
                        borderRadius: 8,
                        padding: "10px 12px",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        color: "#166534",
                        fontSize: "12px",
                      }}
                    >
                      <CheckCircle2 size={16} color="#16A34A" />
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
              backgroundColor: savedBadge ? "#16A34A" : isSaving ? "#3B82F6" : "#2563EB",
              color: "#FFFFFF",
              fontSize: "12.5px",
              fontWeight: 700,
              cursor: isSaving ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              boxShadow: "0 2px 6px rgba(37, 99, 235, 0.2)",
              transition: "background 0.2s ease",
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
    </motion.aside>
  );
};

export default NodeDetailDrawer;
