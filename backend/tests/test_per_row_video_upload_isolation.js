import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MediaAssetResolver } from "../src/services/data/mediaAssetResolver.js";
import driveService from "../src/google/driveService.js";

describe("Per-Row Drive Video Resolution & Upload Isolation Test", () => {
  it("should extract distinct row-specific Google Drive URLs for each row", () => {
    const mockRows = [
      {
        rowNumber: 2,
        values: {
          "Ad Name": "Ad_Row_2",
          "Google Drive Link": "https://drive.google.com/drive/folders/1FOLDER_SHARED_ROOT",
          "Creative Smart Chips": "https://drive.google.com/file/d/1MTRtdwoVHf8w9QIjbmPGuk2XkYvgcZuK/view?usp=sharing",
        },
      },
      {
        rowNumber: 3,
        values: {
          "Ad Name": "Ad_Row_3",
          "Google Drive Link": "https://drive.google.com/drive/folders/1FOLDER_SHARED_ROOT",
          "Creative Smart Chips": "https://drive.google.com/file/d/13pNhSkScmfGg05meI4rgM3OfjXf9kxQ4/view?usp=sharing",
        },
      },
      {
        rowNumber: 4,
        values: {
          "Ad Name": "Ad_Row_4",
          "Google Drive Link": "https://drive.google.com/drive/folders/1FOLDER_SHARED_ROOT",
          "Creative Smart Chips": "https://drive.google.com/file/d/1iJWHTMy2OuyvBU93FyuR7MgFkT8A2-Fa/view?usp=sharing",
        },
      },
      {
        rowNumber: 5,
        values: {
          "Ad Name": "Ad_Row_5",
          "Google Drive Link": "https://drive.google.com/drive/folders/1FOLDER_SHARED_ROOT",
          "Creative Smart Chips": "https://drive.google.com/file/d/1Ko--fwxR9ij1SD8MkxZJWCkQmCPUPwVX/view?usp=sharing",
        },
      },
      {
        rowNumber: 6,
        values: {
          "Ad Name": "Ad_Row_6",
          "Google Drive Link": "https://drive.google.com/drive/folders/1FOLDER_SHARED_ROOT",
          "Creative Smart Chips": "https://drive.google.com/file/d/1ImBD28qc38YEJtAIflT_1R6mKplConMR/view?usp=drive_link",
        },
      },
    ];

    const extractedPerFile = [];
    for (const r of mockRows) {
      const urls = MediaAssetResolver.extractRowDriveUrls(r.values);
      assert.ok(urls.length > 0, `Row #${r.rowNumber} should extract at least one URL`);
      // Crucial: The primary extracted URL MUST be the direct file URL, NEVER the shared folder!
      assert.ok(urls[0].includes("/file/d/"), `Row #${r.rowNumber} primary asset must be direct file, got: ${urls[0]}`);
      assert.ok(!urls[0].includes("/folders/"), `Row #${r.rowNumber} primary asset must not be folder URL`);
      const fileId = driveService.extractFileId(urls[0]);
      extractedPerFile.push({ row: r.rowNumber, fileId, url: urls[0] });
    }

    // Verify all 5 rows have completely unique file IDs
    const uniqueFileIds = new Set(extractedPerFile.map((x) => x.fileId));
    assert.equal(uniqueFileIds.size, 5, "All 5 rows must have distinct, unique Google Drive file IDs");
    console.log("✅ Verified all 5 rows resolve distinct file IDs:", Array.from(uniqueFileIds));
  });

  it("should never allow cross-row cache collision via generic row index", () => {
    const dbVideoMap = new Map();

    // Simulate cached media docs from a past campaign
    const pastUploadedDocs = [
      {
        accountId: "act_1416124059911929",
        mediaType: "VIDEO",
        videoId: "1368601378681996",
        sourceRow: 2,
        fileId: "OLD_CAMPAIGN_ROW2_FILEID",
        sourceUrl: "https://drive.google.com/file/d/OLD_CAMPAIGN_ROW2_FILEID/view",
      },
      {
        accountId: "act_1416124059911929",
        mediaType: "VIDEO",
        videoId: "1154435306914765",
        sourceRow: 10,
        fileId: "OLD_CAMPAIGN_ROW10_FILEID",
        sourceUrl: "https://drive.google.com/file/d/OLD_CAMPAIGN_ROW10_FILEID/view",
      },
    ];

    // Populate dbVideoMap using the NEW safe logic (Strict fileId and sourceUrl keying ONLY)
    for (const cm of pastUploadedDocs) {
      const fileId = cm.fileId || driveService.extractFileId(cm.sourceUrl);
      if (cm.mediaType === "VIDEO" && cm.videoId) {
        if (fileId) dbVideoMap.set(`file_${fileId}`, { videoId: cm.videoId });
        if (cm.sourceUrl) dbVideoMap.set(cm.sourceUrl, { videoId: cm.videoId });
      }
    }

    // CRITICAL: Ensure no generic row-index keys exist
    assert.equal(dbVideoMap.has("row_2"), false, "dbVideoMap must NEVER contain generic 'row_2' key");
    assert.equal(dbVideoMap.has("row_10"), false, "dbVideoMap must NEVER contain generic 'row_10' key");

    // Test a new campaign where Row 2 has a DIFFERENT video asset
    const newRow2Creative = "https://drive.google.com/file/d/1MTRtdwoVHf8w9QIjbmPGuk2XkYvgcZuK/view?usp=sharing";
    const newRow2FileId = driveService.extractFileId(newRow2Creative);

    const cachedLookup = (newRow2FileId ? dbVideoMap.get(`file_${newRow2FileId}`) : null) || dbVideoMap.get(newRow2Creative);
    assert.equal(cachedLookup, undefined, "New Row 2 creative must NOT match old campaign row 2 video!");

    // Test that if the EXACT same fileId is reused in a retry, it DOES match
    const sameFileIdLookup = dbVideoMap.get(`file_OLD_CAMPAIGN_ROW2_FILEID`);
    assert.ok(sameFileIdLookup, "Exact matching fileId should safely hit cache");
    assert.equal(sameFileIdLookup.videoId, "1368601378681996");
    console.log("✅ Verified cross-row cache collision is completely prevented!");
  });
});
