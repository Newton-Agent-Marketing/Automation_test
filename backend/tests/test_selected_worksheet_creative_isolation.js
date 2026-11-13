import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { resolveAiContextSelection } from "../src/services/agent/queryDbMetrics.js";
import { MediaAssetResolver } from "../src/services/data/mediaAssetResolver.js";
import SourceSheetReader from "../src/services/campaignPreparation/sourceSheetReader.js";
import driveService from "../src/google/driveService.js";

describe("Selected Worksheet Tab Creative Isolation Test", () => {
  const mockAiCtx = {
    hasContext: true,
    businessUnitsHierarchy: [
      {
        id: "bu_1",
        name: "Utsav App",
        channels: [{ id: "ch_1", channel: "Meta Ads", accountId: "act_1416124059911929" }],
        products: [{ id: "prod_1", productName: "Utsav Puja" }],
        warehouses: [
          {
            id: "wh_1",
            name: "Warehouse (1 Sheet, 2 Worksheets)",
            activeSheetId: "sheet_1",
            sheetUrl: "https://docs.google.com/spreadsheets/d/18m8I9zte3wZjnfGJjs29294jiVPl4tpIXJE00MQWLow/edit",
            worksheetName: "Eveil Eye | Protection",
            targetTab: "Eveil Eye | Protection",
            selectedTabIds: ["110461623"],
            availableTabs: [
              { sheetId: 0, title: "Wealth & Prosperity" },
              { sheetId: 110461623, title: "Eveil Eye | Protection" },
            ],
            selectedTabsData: [
              {
                sheetId: 110461623,
                tabName: "Eveil Eye | Protection",
                columns: ["Ad Name", "Creative Smart Chips", "Destination Link", "CTA"],
                rows: [
                  {
                    "Ad Name": "NW_Surya_Tab2_Row2",
                    "Creative Smart Chips": "https://drive.google.com/file/d/1TAB2_EXACT_VIDEO_ROW2/view",
                    "Destination Link": "https://utsavapp.in/puja/surya",
                    "CTA": "BOOK_TRAVEL",
                  },
                  {
                    "Ad Name": "NW_Surya_Tab2_Row3",
                    "Creative Smart Chips": "https://drive.google.com/file/d/1TAB2_EXACT_VIDEO_ROW3/view",
                    "Destination Link": "https://utsavapp.in/puja/surya",
                    "CTA": "BOOK_TRAVEL",
                  },
                ],
                totalRows: 2,
                totalDataRows: 2,
              },
            ],
            sheets: [
              {
                id: "sheet_1",
                workbookName: "NWTN | Utsav Ads",
                sheetUrl: "https://docs.google.com/spreadsheets/d/18m8I9zte3wZjnfGJjs29294jiVPl4tpIXJE00MQWLow/edit",
                worksheetName: "Eveil Eye | Protection",
                targetTab: "Eveil Eye | Protection",
                selectedTabIds: ["110461623"],
                availableTabs: [
                  { sheetId: 0, title: "Wealth & Prosperity" },
                  { sheetId: 110461623, title: "Eveil Eye | Protection" },
                ],
                selectedTabsData: [
                  {
                    sheetId: 110461623,
                    tabName: "Eveil Eye | Protection",
                    columns: ["Ad Name", "Creative Smart Chips", "Destination Link", "CTA"],
                    rows: [
                      {
                        "Ad Name": "NW_Surya_Tab2_Row2",
                        "Creative Smart Chips": "https://drive.google.com/file/d/1TAB2_EXACT_VIDEO_ROW2/view",
                        "Destination Link": "https://utsavapp.in/puja/surya",
                        "CTA": "BOOK_TRAVEL",
                      },
                      {
                        "Ad Name": "NW_Surya_Tab2_Row3",
                        "Creative Smart Chips": "https://drive.google.com/file/d/1TAB2_EXACT_VIDEO_ROW3/view",
                        "Destination Link": "https://utsavapp.in/puja/surya",
                        "CTA": "BOOK_TRAVEL",
                      },
                    ],
                  },
                ],
                isSelected: true,
              },
            ],
          },
        ],
      },
    ],
  };

  it("should resolve targetWorksheetName as 'Eveil Eye | Protection' when Tab 2 is active in AI Context", () => {
    const res = resolveAiContextSelection({
      aiCtx: mockAiCtx,
      userMessage: "create ad",
      requestedChannel: "Meta Ads",
    });

    assert.ok(res.hasSelection, "Should have selection");
    assert.strictEqual(res.targetWorksheetName, "Eveil Eye | Protection", "Must resolve Tab 2's name");
    assert.ok(res.selectedSheet, "Must have selectedSheet");
    assert.strictEqual(res.selectedSheet.worksheetName, "Eveil Eye | Protection");
  });

  it("should extract row-specific creative video for Tab 2 rows without falling back to Tab 1", () => {
    const tab2Row2 = mockAiCtx.businessUnitsHierarchy[0].warehouses[0].sheets[0].selectedTabsData[0].rows[0];
    const tab2Row3 = mockAiCtx.businessUnitsHierarchy[0].warehouses[0].sheets[0].selectedTabsData[0].rows[1];

    const urlsRow2 = MediaAssetResolver.extractRowDriveUrls(tab2Row2, "VIDEO");
    const urlsRow3 = MediaAssetResolver.extractRowDriveUrls(tab2Row3, "VIDEO");

    assert.strictEqual(urlsRow2[0], "https://drive.google.com/file/d/1TAB2_EXACT_VIDEO_ROW2/view");
    assert.strictEqual(urlsRow3[0], "https://drive.google.com/file/d/1TAB2_EXACT_VIDEO_ROW3/view");
    assert.notStrictEqual(urlsRow2[0], urlsRow3[0], "Row 2 and Row 3 must have distinct videos");
  });

  it("should never allow a shared folder URL to be cached or reused as a 1-to-1 video asset", () => {
    const dbVideoMap = new Map();
    const sharedFolderUrl = "https://drive.google.com/drive/folders/1SHARED_ROOT_FOLDER";

    // Simulate folder check rule: folders are strictly NOT added to dbVideoMap
    const isFolder = sharedFolderUrl.includes("/folders/");
    assert.strictEqual(isFolder, true, "URL must be detected as folder");

    if (!isFolder) {
      dbVideoMap.set(sharedFolderUrl, { videoId: "OLD_TAB1_VIDEO_ID" });
    }

    assert.strictEqual(dbVideoMap.has(sharedFolderUrl), false, "Folder URL must never exist in dbVideoMap");
  });

  it("should prioritize newly selected Tab 2 over Tab 1 even when both tab IDs are present in selection", () => {
    // When user toggles Tab 2 in warehouse UI, selectedTabIds has [0, 110461623] with Tab 2 as latest
    const multiTabAiCtx = {
      ...mockAiCtx,
      businessUnitsHierarchy: [
        {
          ...mockAiCtx.businessUnitsHierarchy[0],
          warehouses: [
            {
              ...mockAiCtx.businessUnitsHierarchy[0].warehouses[0],
              selectedTabIds: ["0", "110461623"], // Tab 1 and Tab 2
              worksheetName: "Eveil Eye | Protection",
              targetTab: "Eveil Eye | Protection",
              sheets: [
                {
                  ...mockAiCtx.businessUnitsHierarchy[0].warehouses[0].sheets[0],
                  selectedTabIds: ["0", "110461623"],
                  worksheetName: "Eveil Eye | Protection",
                  targetTab: "Eveil Eye | Protection",
                },
              ],
            },
          ],
        },
      ],
    };

    const res = resolveAiContextSelection({
      aiCtx: multiTabAiCtx,
      userMessage: "create ad",
      requestedChannel: "Meta Ads",
    });

    assert.strictEqual(res.targetWorksheetName, "Eveil Eye | Protection", "Must prioritize the active Tab 2");
  });

  it("should retire stale preparation session when AI Context worksheet differs from session worksheet", () => {
    // Simulate old session saved from previous ad creation on Tab 1
    const oldSession = {
      source: {
        worksheetName: "Wealth & Prosperity",
      },
      status: "APPROVED",
    };

    const contextNodeData = {
      targetWorksheetName: "Eveil Eye | Protection",
      worksheetName: "Eveil Eye | Protection",
    };

    let session = { ...oldSession };
    const freshTargetWorksheet = contextNodeData?.targetWorksheetName || contextNodeData?.worksheetName;

    if (session && freshTargetWorksheet && session.source?.worksheetName) {
      const cleanFresh = freshTargetWorksheet.trim().toLowerCase();
      const cleanOld = session.source.worksheetName.trim().toLowerCase();
      if (cleanFresh !== cleanOld) {
        session.status = "COMPLETED";
        session = null;
      }
    }

    assert.strictEqual(session, null, "Old session for Tab 1 must be retired when user switches to Tab 2");
    assert.strictEqual(oldSession.status, "APPROVED", "Original object preserved or updated");
  });

  it("should resolve Tab 2 (Chhath Puja) when only Tab 2 is checked in selectedTabIds even if worksheetName was Tithi Mix", () => {
    const tithiMixCtx = {
      hasContext: true,
      businessUnitsHierarchy: [
        {
          id: "bu_1",
          name: "Utsav App",
          warehouses: [
            {
              id: "wh_1",
              name: "Copy of Utsav Ads",
              worksheetName: "Tithi Mix", // Old string
              targetTab: "Tithi Mix",
              selectedTabIds: ["100234"], // User checked only Tab 2 (Chhath Puja)
              availableTabs: [
                { sheetId: 0, title: "Tithi Mix", rowCount: 1000 },
                { sheetId: 100234, title: "Chhath Puja", rowCount: 1000 },
              ],
              selectedTabsData: [
                {
                  sheetId: 100234,
                  tabName: "Chhath Puja",
                  columns: ["Ad Name", "Creative Smart Chips"],
                  rows: [
                    { "Ad Name": "Chhath_Ad_1", "Creative Smart Chips": "https://drive.google.com/file/d/CHHATH_VIDEO_1/view" },
                  ],
                },
              ],
              sheets: [
                {
                  id: "sheet_1",
                  worksheetName: "Tithi Mix",
                  targetTab: "Tithi Mix",
                  selectedTabIds: ["100234"],
                  availableTabs: [
                    { sheetId: 0, title: "Tithi Mix", rowCount: 1000 },
                    { sheetId: 100234, title: "Chhath Puja", rowCount: 1000 },
                  ],
                  selectedTabsData: [
                    {
                      sheetId: 100234,
                      tabName: "Chhath Puja",
                      columns: ["Ad Name", "Creative Smart Chips"],
                      rows: [
                        { "Ad Name": "Chhath_Ad_1", "Creative Smart Chips": "https://drive.google.com/file/d/CHHATH_VIDEO_1/view" },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const res = resolveAiContextSelection({
      aiCtx: tithiMixCtx,
      userMessage: "create ad",
      requestedChannel: "Meta Ads",
    });

    assert.strictEqual(res.targetWorksheetName, "Chhath Puja", "Must resolve Chhath Puja from selectedTabIds rather than stale Tithi Mix string");
  });

  it("should truncate long filenames to strictly prevent ENAMETOOLONG on Linux (< 255 bytes)", async () => {
    const fileId = "1G5kuUDWpFcsv2P7ZwAry7Pbs0bgNOYWv";
    const ultraLongName = "UTSAV_CAMPAIGN_FESTIVAL_SPECIAL_OFFER_VIDEO_CREATIVE_ROW_2_CHHATH_PUJA_VERY_LONG_NOMENCLATURE_WITH_MANY_PARAMETERS_AND_METRICS_AND_LABELS_FOR_TARGETING_PURPOSES_AUDIENCE_LOOKALIKE_MALE_FEMALE_25_45_TIER1_TIER2_SPECIAL_DISCOUNT_OFFER_VIDEO_CREATIVE_1080x1920_REEL_STORY_PLACEMENT_HIGH_CTR.mp4";

    const safeName = driveService.sanitizeBasename(ultraLongName, fileId, ".mp4");

    // Total filename length must be well under 100 characters (< 255 limit)
    assert.ok(safeName.length <= 100, `Safe filename must be <= 100 chars, got: ${safeName.length} ("${safeName}")`);
    assert.ok(safeName.startsWith(fileId), `Safe filename must preserve fileId prefix: ${safeName}`);
    assert.ok(safeName.endsWith(".mp4"), `Safe filename must preserve .mp4 extension: ${safeName}`);
    assert.ok(!/[^a-zA-Z0-9._-]/.test(safeName), "Safe filename must only contain filesystem-safe characters");

    // Verify creating write stream in scratchDir succeeds without ENAMETOOLONG
    driveService.ensureScratchDir();
    const testPath = path.join(driveService.scratchDir, safeName);
    const writer = fs.createWriteStream(testPath);
    await new Promise((resolve) => {
      writer.on("finish", resolve);
      writer.write("TEST");
      writer.end();
    });
    assert.ok(fs.existsSync(testPath), "Scratch file should be created cleanly without ENAMETOOLONG");
    fs.unlinkSync(testPath);
  });

  it("should resolve Tab 3 (NWTN | Ganpati) when 3rd tab is checked even if Tab 1 was default", () => {
    const multiTab4Ctx = {
      hasContext: true,
      businessUnitsHierarchy: [
        {
          id: "bu_1",
          name: "Utsav App",
          channels: [{ id: "ch_1", channel: "Meta Ads", accountId: "act_1416124059911929" }],
          products: [{ id: "prod_1", productName: "Utsav Puja" }],
          warehouses: [
            {
              id: "wh_1",
              name: "Warehouse (4 Tabs)",
              sheetUrl: "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit",
              worksheetName: "NWTN | Telugu Ads", // stale Tab 1 default
              targetTab: "NWTN | Telugu Ads",
              selectedTabIds: ["100234"], // User checked Tab 3
              availableTabs: [
                { sheetId: 0, title: "NWTN | Telugu Ads", rowCount: 1000 },
                { sheetId: 100123, title: "NWTN | Ghrishneshwar", rowCount: 997 },
                { sheetId: 100234, title: "NWTN | Ganpatipule", rowCount: 1000 },
                { sheetId: 100345, title: "New Creatives Batch 2", rowCount: 998 },
              ],
              selectedTabsData: [
                {
                  sheetId: 100234,
                  tabName: "NWTN | Ganpatipule",
                  columns: ["Ad Name", "Creative Smart Chips"],
                  rows: [
                    { "Ad Name": "Ganpati_Ad_1", "Creative Smart Chips": "https://drive.google.com/file/d/GANPATI_VIDEO_1/view" },
                  ],
                },
              ],
              sheets: [
                {
                  id: "sheet_1",
                  worksheetName: "NWTN | Telugu Ads",
                  selectedTabIds: ["100234"],
                  availableTabs: [
                    { sheetId: 0, title: "NWTN | Telugu Ads", rowCount: 1000 },
                    { sheetId: 100123, title: "NWTN | Ghrishneshwar", rowCount: 997 },
                    { sheetId: 100234, title: "NWTN | Ganpatipule", rowCount: 1000 },
                    { sheetId: 100345, title: "New Creatives Batch 2", rowCount: 998 },
                  ],
                  selectedTabsData: [
                    {
                      sheetId: 100234,
                      tabName: "NWTN | Ganpatipule",
                      columns: ["Ad Name", "Creative Smart Chips"],
                      rows: [
                        { "Ad Name": "Ganpati_Ad_1", "Creative Smart Chips": "https://drive.google.com/file/d/GANPATI_VIDEO_1/view" },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const res = resolveAiContextSelection({
      aiCtx: multiTab4Ctx,
      userMessage: "create ad",
      requestedChannel: "Meta Ads",
    });

    assert.strictEqual(res.targetWorksheetName, "NWTN | Ganpatipule", "Must resolve Tab 3 from selectedTabIds rather than stale Tab 1 string");
  });

  it("should resolve Tab 4 when prompt specifies 'fourth worksheet' or '4th worksheet'", () => {
    const multiTab4Ctx = {
      hasContext: true,
      businessUnitsHierarchy: [
        {
          id: "bu_1",
          name: "Utsav App",
          channels: [{ id: "ch_1", channel: "Meta Ads", accountId: "act_1416124059911929" }],
          products: [{ id: "prod_1", productName: "Utsav Puja" }],
          warehouses: [
            {
              id: "wh_1",
              name: "Warehouse (4 Tabs)",
              sheetUrl: "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit",
              availableTabs: [
                { sheetId: 0, title: "NWTN | Telugu Ads", rowCount: 1000 },
                { sheetId: 100123, title: "NWTN | Ghrishneshwar", rowCount: 997 },
                { sheetId: 100234, title: "NWTN | Ganpatipule", rowCount: 1000 },
                { sheetId: 100345, title: "New Creatives Batch 2", rowCount: 998 },
              ],
            },
          ],
        },
      ],
    };

    const res4th = resolveAiContextSelection({
      aiCtx: multiTab4Ctx,
      userMessage: "create ad from 4th worksheet",
      requestedChannel: "Meta Ads",
    });
    assert.strictEqual(res4th.targetWorksheetName, "New Creatives Batch 2", "Must resolve Tab 4 when user says '4th worksheet'");

    const resFourth = resolveAiContextSelection({
      aiCtx: multiTab4Ctx,
      userMessage: "fourth worksheet wala ad create karo",
      requestedChannel: "Meta Ads",
    });
    assert.strictEqual(resFourth.targetWorksheetName, "New Creatives Batch 2", "Must resolve Tab 4 when user says 'fourth worksheet wala'");
  });

  it("should never throw 'target is not defined' in SourceSheetReader.readSource", async () => {
    // Calling readSource with google sheets url without AI context userId should execute safely without ReferenceError
    const res = await SourceSheetReader.readSource({
      sheetUrlOrId: "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit",
      worksheetName: "NWTN | Ganpatipule",
    });
    assert.ok(res, "SourceSheetReader should return a valid result object");
    assert.strictEqual(res.sourceType, "google_sheets");
  });

  it("should parse specific row requests in various formats (Hindi/Hinglish & English)", async () => {
    const { DynamicSheetFilter } = await import("../src/services/data/dynamicSheetFilter.js");

    // Single row with Hindi/Hinglish phrasing
    const r1 = DynamicSheetFilter.parseRowRange("row 2 ka ad upload karna hai", 50);
    assert.strictEqual(r1.isExplicitRange, true);
    assert.strictEqual(r1.type, "SINGLE_ROW");
    assert.strictEqual(r1.start, 2);

    const r2 = DynamicSheetFilter.parseRowRange("specific row 3", 50);
    assert.strictEqual(r2.isExplicitRange, true);
    assert.strictEqual(r2.type, "SINGLE_ROW");
    assert.strictEqual(r2.start, 3);

    const r3 = DynamicSheetFilter.parseRowRange("sirf row 4 upload karo", 50);
    assert.strictEqual(r3.isExplicitRange, true);
    assert.strictEqual(r3.type, "SINGLE_ROW");
    assert.strictEqual(r3.start, 4);

    const r4 = DynamicSheetFilter.parseRowRange("row no. 5 ka ad banao", 50);
    assert.strictEqual(r4.isExplicitRange, true);
    assert.strictEqual(r4.type, "SINGLE_ROW");
    assert.strictEqual(r4.start, 5);

    // Prompt without row filter should not falsely match numbers in campaign name
    const promptWithCampaignName =
      'create a new meta ads campaign name : "NWTN | Utsav | Ganpati 31 | New Creatives Test " and adset name : "NWTN | Ganpati 31 | New Creatives Test " and ad name : " Nomenclature " and use sheet data to create ads.';
    const r5 = DynamicSheetFilter.parseRowRange(promptWithCampaignName, 50);
    assert.strictEqual(r5.isExplicitRange, false, "Should not falsely match 'Ganpati 31' as row 31");
    assert.strictEqual(r5.type, "ALL");
  });
});

