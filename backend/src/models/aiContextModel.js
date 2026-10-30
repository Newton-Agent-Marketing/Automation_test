import mongoose, { Schema } from "mongoose";

const nodeSchema = new Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: [
        "user_input",
        "business_unit",
        "ad_channel",
        "marketing_brief",
        "product",
        "data_warehouse",
      ],
      default: "business_unit",
    },
    label: { type: String, required: true },
    subtitle: { type: String, default: "" },
    contextTag: { type: String, default: "Primary Marketing Context" },
    previousNodeId: { type: String, default: null },
    previousNodeLabel: { type: String, default: null },
    previousNodeType: { type: String, default: null },
    stepIndex: { type: Number, default: 1 },
    isRoot: { type: Boolean, default: false },
    position: {
      x: { type: Number, default: 100 },
      y: { type: Number, default: 200 },
    },
    data: {
      name: { type: String, default: "" },
      description: { type: String, default: "" },
      contextTag: { type: String, default: "Primary Marketing Context" },
      // Ad Channel Node fields
      businessUnitName: { type: String, default: "" },
      accountName: { type: String, default: "" },
      channelName: { type: String, default: "" },
      adAccountId: { type: String, default: "" },
      funnelEvent: { type: String, default: "" },
      funnelDescription: { type: String, default: "" },
      // Marketing Brief Node fields
      timeframeType: { type: String, default: "month" },
      targetMonth: { type: String, default: "" },
      startDate: { type: String, default: "" },
      endDate: { type: String, default: "" },
      formattedPeriod: { type: String, default: "" },
      metrics: { type: String, default: "" },
      metricsList: {
        type: [
          {
            id: { type: String, default: "" },
            startDate: { type: String, default: "" },
            endDate: { type: String, default: "" },
            formattedPeriod: { type: String, default: "" },
            metrics: { type: String, default: "" },
          },
        ],
        default: [],
      },
      // Product Node fields
      productName: { type: String, default: "" },
      productUrl: { type: String, default: "" },
      productPrice: { type: Schema.Types.Mixed, default: "" },
      productPlatforms: { type: [String], default: ["Web"] },
      products: {
        type: [
          {
            id: { type: String, default: "" },
            name: { type: String, default: "" },
            price: { type: Schema.Types.Mixed, default: "" },
            url: { type: String, default: "" },
            sku: { type: String, default: "" },
            category: { type: String, default: "" },
            platforms: { type: [String], default: ["Web"] },
          },
        ],
        default: [],
      },
      catalogCount: { type: Number, default: 0 },
      // Data Warehouse Node fields (Excel Sheet = WHAT, Google Drive = MEDIA)
      sheets: {
        type: [
          {
            id: { type: String, default: "" },
            sheetUrl: { type: String, default: "" },
            excelProvider: { type: String, default: "Google Sheets" },
            workbookId: { type: String, default: "" },
            workbookName: { type: String, default: "" },
            worksheetId: { type: String, default: "" },
            worksheetName: { type: String, default: "" },
            availableTabs: { type: [Schema.Types.Mixed], default: [] },
            selectedTabIds: { type: [Schema.Types.Mixed], default: [] },
            selectedTabsData: { type: [Schema.Types.Mixed], default: [] },
            excelSyncStatus: { type: String, default: "NOT_CONNECTED" },
            lastSyncedAt: { type: Date, default: null },
            totalRows: { type: Number, default: 0 },
            totalDataRows: { type: Number, default: 0 },
            totalSheetRows: { type: Number, default: 0 },
            sheetColumns: { type: [String], default: [] },
            sheetRows: { type: [Schema.Types.Mixed], default: [] },
            sheetMetadata: { type: Schema.Types.Mixed, default: {} },
            dataLabels: { type: String, default: "" },
            dataLevel: { type: String, default: "" },
          },
        ],
        default: [],
      },
      warehouseSource: { type: String, enum: ["excel_sheet", "google_drive", "both"], default: "both" },
      sheetUrl: { type: String, default: "" },
      excelProvider: { type: String, default: "Google Sheets" },
      workbookId: { type: String, default: "" },
      workbookName: { type: String, default: "" },
      worksheetId: { type: String, default: "" },
      worksheetName: { type: String, default: "" },
      availableTabs: { type: [Schema.Types.Mixed], default: [] },
      selectedTabIds: { type: [Schema.Types.Mixed], default: [] },
      selectedTabsData: { type: [Schema.Types.Mixed], default: [] },
      excelSyncStatus: { type: String, default: "NOT_CONNECTED" },
      lastSyncedAt: { type: Date, default: null },
      totalRows: { type: Number, default: 0 },
      totalDataRows: { type: Number, default: 0 },
      totalSheetRows: { type: Number, default: 0 },
      lastRowNumber: { type: Number, default: 0 },
      headerRowNumber: { type: Number, default: 1 },
      eligibleAdRowsCount: { type: Number, default: 0 },
      validationErrorRowsCount: { type: Number, default: 0 },
      readyRowsCount: { type: Number, default: 0 },
      correctionRequiredRowsCount: { type: Number, default: 0 },
      sheetColumns: { type: [String], default: [] },
      sheetRows: { type: [Schema.Types.Mixed], default: [] },
      sheetMetadata: { type: Schema.Types.Mixed, default: {} },
      googleDriveConnected: { type: Boolean, default: false },
      googleDriveEmail: { type: String, default: "" },
      googleDriveFolderId: { type: String, default: "" },
      googleDriveFolderName: { type: String, default: "" },
      dataLevel: { type: String, default: "" },
      dataLabels: { type: String, default: "" },
      databasePlatform: { type: String, default: "Excel Sheet & Google Drive" },
      config: { type: Schema.Types.Mixed, default: {} },
    },
  },
  { _id: false }
);

const edgeSchema = new Schema(
  {
    id: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    sourceHandle: { type: String, default: "right" },
    targetHandle: { type: String, default: "left" },
    label: { type: String, default: "" },
  },
  { _id: false }
);

const flowStepSchema = new Schema(
  {
    step: { type: Number, default: 1 },
    nodeId: { type: String, required: true },
    type: { type: String, required: true },
    label: { type: String, required: true },
    subtitle: { type: String, default: "" },
    contextTag: { type: String, default: "" },
    previousNode: {
      id: { type: String, default: null },
      label: { type: String, default: null },
      type: { type: String, default: null },
    },
    details: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const flowSchema = new Schema(
  {
    flowIndex: { type: Number, default: 1 },
    flowTag: { type: String, default: "" },
    flowSummary: { type: String, default: "" },
    totalSteps: { type: Number, default: 1 },
    pathNodeIds: { type: [String], default: [] },
    campaignLaunchParameters: { type: Schema.Types.Mixed, default: {} },
    steps: { type: [flowStepSchema], default: [] },
  },
  { _id: false }
);

const aiContextSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      default: "Primary AI Context Workflow",
    },
    nodes: {
      type: [nodeSchema],
      default: [],
    },
    edges: {
      type: [edgeSchema],
      default: [],
    },
    flows: {
      type: [flowSchema],
      default: [],
    },
    viewport: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
      zoom: { type: Number, default: 1 },
    },
  },
  {
    timestamps: true,
  }
);

const AiContext = mongoose.model("AiContext", aiContextSchema);

export default AiContext;
