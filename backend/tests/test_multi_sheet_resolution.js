import { describe, it } from "node:test";
import assert from "node:assert";
import { resolveAiContextSelection } from "../src/services/agent/queryDbMetrics.js";
import { MediaAssetResolver } from "../src/services/data/mediaAssetResolver.js";

describe("Multi-Sheet & Worksheet Tab Resolution Test", () => {
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
            name: "Warehouse (2 Sheets)",
            activeSheetId: "sheet_2",
            activeSheetIndex: 1,
            sheetUrl: "https://docs.google.com/spreadsheets/d/18m8I9zte3wZjnfGJjs29294jiVPl4tpIXJE00MQWLow/edit",
            worksheetName: "Eveil Eye | Protection",
            sheets: [
              {
                id: "sheet_1",
                workbookName: "NWTN | Utsav BAU",
                sheetUrl: "https://docs.google.com/spreadsheets/d/1WsNqpKOvR6HB_r2EOQSlIse0MDlUSpsufTL3B9IePnA/edit",
                worksheetName: "Wealth & Prosperity",
                targetTab: "Wealth & Prosperity",
                selectedTabIds: ["Wealth & Prosperity"],
                availableTabs: [
                  { sheetId: "0", title: "Wealth & Prosperity" },
                  { sheetId: "1", title: "Health & Career" }
                ],
                selectedTabsData: [{ tabName: "Wealth & Prosperity" }],
                isSelected: false
              },
              {
                id: "sheet_2",
                workbookName: "NWTN | Utsav | 2-5 Nov Tithi",
                sheetUrl: "https://docs.google.com/spreadsheets/d/18m8I9zte3wZjnfGJjs29294jiVPl4tpIXJE00MQWLow/edit",
                worksheetName: "Eveil Eye | Protection",
                targetTab: "Eveil Eye | Protection",
                selectedTabIds: ["110461623"],
                availableTabs: [
                  { sheetId: "0", title: "Wealth & Prosperity" },
                  { sheetId: "110461623", title: "Eveil Eye | Protection" },
                  { sheetId: "220461623", title: "Numerology & Astrology" }
                ],
                selectedTabsData: [{ tabName: "Eveil Eye | Protection", sheetId: "110461623" }],
                isSelected: true,
                lastSyncedAt: new Date().toISOString()
              }
            ]
          }
        ]
      }
    ]
  };

  it("should accurately resolve Sheet #2 when user says 'create a ad use 2nd sheet data'", () => {
    const res = resolveAiContextSelection({
      aiCtx: mockAiCtx,
      userMessage: "create a ad use 2nd sheet data",
      requestedChannel: "Meta Ads"
    });

    assert.ok(res.selectedSheet, "Must return a selected sheet");
    assert.strictEqual(res.selectedSheet.id, "sheet_2", "Must resolve to Sheet #2");
    assert.strictEqual(res.targetWorksheetName, "Eveil Eye | Protection", "Must select Eveil Eye | Protection worksheet tab");
    assert.strictEqual(res.selectedSheet.sheetUrl, "https://docs.google.com/spreadsheets/d/18m8I9zte3wZjnfGJjs29294jiVPl4tpIXJE00MQWLow/edit");
  });

  it("should accurately resolve Sheet #2 when user says 'use second sheet data'", () => {
    const res = resolveAiContextSelection({
      aiCtx: mockAiCtx,
      userMessage: "use second sheet data",
      requestedChannel: "Meta Ads"
    });

    assert.strictEqual(res.selectedSheet.id, "sheet_2");
    assert.strictEqual(res.targetWorksheetName, "Eveil Eye | Protection");
  });

  it("should accurately resolve Sheet #2 when user says 'create ad from sheet 2'", () => {
    const res = resolveAiContextSelection({
      aiCtx: mockAiCtx,
      userMessage: "create ad from sheet 2",
      requestedChannel: "Meta Ads"
    });

    assert.strictEqual(res.selectedSheet.id, "sheet_2");
    assert.strictEqual(res.targetWorksheetName, "Eveil Eye | Protection");
  });

  it("should resolve Sheet #2 when user mentions worksheet tab name directly 'create ad for Eveil Eye'", () => {
    const res = resolveAiContextSelection({
      aiCtx: mockAiCtx,
      userMessage: "create ad for Eveil Eye",
      requestedChannel: "Meta Ads"
    });

    assert.strictEqual(res.selectedSheet.id, "sheet_2");
    assert.strictEqual(res.targetWorksheetName, "Eveil Eye | Protection");
  });

  it("should resolve active selected sheet (Sheet #2) by default when user just says 'create ad'", () => {
    const res = resolveAiContextSelection({
      aiCtx: mockAiCtx,
      userMessage: "create ad",
      requestedChannel: "Meta Ads"
    });

    assert.strictEqual(res.selectedSheet.id, "sheet_2");
    assert.strictEqual(res.targetWorksheetName, "Eveil Eye | Protection");
  });

  it("should resolve Sheet #1 when user explicitly asks for '1st sheet'", () => {
    const res = resolveAiContextSelection({
      aiCtx: mockAiCtx,
      userMessage: "create ad using 1st sheet",
      requestedChannel: "Meta Ads"
    });

    assert.strictEqual(res.selectedSheet.id, "sheet_1");
    assert.strictEqual(res.targetWorksheetName, "Wealth & Prosperity");
  });

  it("should extract correct Google Drive video URL from Eveil Eye row #2", () => {
    const rowValues = {
      "Ad Name": "02/11/2026 _ NW_Kali+Bhairav_Bhadra Kali Temple+Batuk Bhairav_Sultanpur+Ujjain_NA_Event_Tithi_Annual_ProblemUnawareSolutionUnaware_Face Video_Hope+Devotion+Protection_Negativity+Nazar Dosh_Hinglish_Hindi_Ankita De_Female_Masik Kalashtami (Kartik Mash Visesh)_02/11/2026_60sTo90s_Web_Acquisition_OD_02/11/2026_Video_In-house_26to35_Arijit Bera_Pooja Rawat_Utsav_28 Oct 2026_OD-26-2302",
      "Creative Smart Chips": "https://drive.google.com/file/d/1Wmqan58rnEPDUAoY_bwa-PHias8HjbKP/view?usp=drive_link",
      "Destination Link": "https://utsavapp.in/puja/kali/amavasya-visesh-bhadrakali-batuk-bhairav",
      "CTA": "BOOK_TRAVEL"
    };

    const urls = MediaAssetResolver.extractRowDriveUrls(rowValues);
    assert.ok(urls.length > 0, "Must extract at least 1 URL");
    assert.strictEqual(urls[0], "https://drive.google.com/file/d/1Wmqan58rnEPDUAoY_bwa-PHias8HjbKP/view?usp=drive_link");
  });
});
