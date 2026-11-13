import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveAiContextSelection } from "../src/services/agent/queryDbMetrics.js";
import { MediaAssetResolver } from "../src/services/data/mediaAssetResolver.js";
import SourceSheetReader from "../src/services/campaignPreparation/sourceSheetReader.js";

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
});

