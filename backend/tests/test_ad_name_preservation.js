import test from "node:test";
import assert from "node:assert/strict";
import { DynamicSheetFilter } from "../src/services/data/dynamicSheetFilter.js";
import MetaApiService from "../src/services/meta/metaApiService.js";
import { CampaignValidator } from "../src/services/campaignPreparation/campaignValidator.js";

const sampleLongAdName =
  "NW_Surya+Other_Surya Narayan Mandir_Gaya_NA_Event_Tithi_Annual_ProblemUnawareSolutionAware_Face Video_Devotion+Hope+FOMO_Family & Ancestors+Health+Career+Business+Wellness_Hinglish_Hindi_Ankita De_Female_Chhath Puja_15/11/2026_60sTo90s_Web_Acquisition_OD_15/11/2026_Video_In-house_26to35_Arijit Bera_Pooja Rawat_Utsav_11/11/2026_2026-6883";

test("DynamicSheetFilter.parseAdNamePattern preserves full long ad names from user prompts", () => {
  // 1. Bare declaration
  const p1 = `adName: ${sampleLongAdName}`;
  assert.equal(DynamicSheetFilter.parseAdNamePattern(p1), sampleLongAdName);

  // 2. Trailing action instruction "and use sheet data to create ads"
  const p2 = `adName: ${sampleLongAdName} and use sheet data to create ads`;
  assert.equal(DynamicSheetFilter.parseAdNamePattern(p2), sampleLongAdName);

  // 3. Trailing row filter "for rows 2 to 4"
  const p3 = `create ad with adName: ${sampleLongAdName} for rows 2 to 4`;
  assert.equal(DynamicSheetFilter.parseAdNamePattern(p3), sampleLongAdName);

  // 4. Quoted ad name
  const p4 = `adName: "${sampleLongAdName}" and upload creatives`;
  assert.equal(DynamicSheetFilter.parseAdNamePattern(p4), sampleLongAdName);

  // 5. Alternate phrasing: "Put Ads with Name - ..."
  const p5 = `Put Ads with Name - ${sampleLongAdName}`;
  assert.equal(DynamicSheetFilter.parseAdNamePattern(p5), sampleLongAdName);
});

test("DynamicSheetFilter.evaluateAdNamePattern does not mangle literal long ad names", () => {
  const rowVals = {
    "Creative Code": "OD-26-2219",
    "Nomenclature": "NW_Rahu_Video1",
    "Temple Name": "Surya Narayan Mandir",
  };
  const headers = Object.keys(rowVals);

  // Literal ad name should remain completely untouched
  const res = DynamicSheetFilter.evaluateAdNamePattern(sampleLongAdName, rowVals, headers, 2);
  assert.equal(res, sampleLongAdName);
  assert.ok(!res.includes(" _ "), "Should not replace underscores with ' _ '");
  assert.ok(!res.includes(" 15 _ 11 _ 2026 "), "Should not corrupt date slashes");
});

test("DynamicSheetFilter.evaluateAdNamePattern correctly resolves column formulas", () => {
  const rowVals = {
    "Creative Code": "OD-26-2219",
    "Nomenclature": "NW_Rahu_Video1",
    "Temple Name": "Surya Narayan Mandir",
  };
  const headers = Object.keys(rowVals);

  const formula1 = "Creative Code + Nomenclature";
  const res1 = DynamicSheetFilter.evaluateAdNamePattern(formula1, rowVals, headers, 2);
  assert.equal(res1, "OD-26-2219 + NW_Rahu_Video1");

  const formula2 = "[Temple Name] - [Creative Code]";
  const res2 = DynamicSheetFilter.evaluateAdNamePattern(formula2, rowVals, headers, 2);
  assert.equal(res2, "Surya Narayan Mandir - OD-26-2219");
});

test("MetaApiService.formatAdName does not truncate long 300+ char ad names", () => {
  assert.ok(sampleLongAdName.length > 250, "Sample ad name should be longer than old 250 cap");
  const formatted = MetaApiService.formatAdName(sampleLongAdName);
  assert.equal(formatted, sampleLongAdName);
  assert.equal(formatted.length, sampleLongAdName.length);
});

test("MetaApiService.formatCreativeName does not truncate long 300+ char creative names", () => {
  const formatted = MetaApiService.formatCreativeName(sampleLongAdName);
  assert.ok(formatted.startsWith(sampleLongAdName));
  assert.ok(formatted.endsWith("Creative"));
});

test("CampaignValidator preserves full custom adName across rows", async () => {
  const sourceData = {
    headers: ["Creative", "Landing Page", "Puja Date"],
    rows: [
      {
        rowNumber: 2,
        values: {
          "Creative": "https://drive.google.com/file/d/1G5kuUDWpFcsv2P7ZwAry7Pbs0bgNOYWv/view",
          "Landing Page": "https://utsavapp.in/puja",
          "Puja Date": "15/11/2026",
          "Ad Name": sampleLongAdName,
        },
      },
    ],
  };

  const valResult = await CampaignValidator.validate({
    campaignName: "Test Campaign",
    adSetName: "Test AdSet",
    sourceData,
    adNamePattern: sampleLongAdName,
    userAnswers: {
      pageId: "102938475610293",
      primaryText: "Special Chhath Puja offerings for peace and health.",
      headline: "Special Puja Offer",
    },
  });

  assert.equal(valResult.adLevelRows[0].adName, sampleLongAdName);
});

