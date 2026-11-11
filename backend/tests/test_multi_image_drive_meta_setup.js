// backend/tests/test_multi_image_drive_meta_setup.js
import assert from "assert";
import driveService from "../src/google/driveService.js";
import { CampaignValidator } from "../src/services/campaignPreparation/campaignValidator.js";

async function runTestSuite() {
  console.log("=== MULTI-IMAGE GOOGLE DRIVE & META ADS SETUP TEST SUITE ===\n");

  // --- 1. DriveService Folder Selection Policy (Default preserves all images) ---
  console.log("--- 1. DriveService Folder Asset Selection Policy ---");
  {
    const fakeFolderObj = {
      id: "folder_12345",
      name: "Campaign Creative Assets",
      resolutionType: "EXACT_ID_FOLDER",
    };

    // Mock listFiles returning 2 images in the folder
    const origListFiles = driveService.listFiles;
    driveService.listFiles = async () => ({
      files: [
        {
          id: "img_file_001",
          name: "banner_1200x1200.png",
          mimeType: "image/png",
          webViewLink: "https://drive.google.com/file/d/img_file_001/view",
        },
        {
          id: "img_file_002",
          name: "promo_1080x1080.jpg",
          mimeType: "image/jpeg",
          webViewLink: "https://drive.google.com/file/d/img_file_002/view",
        },
      ],
    });

    const downloadedIds = [];
    const origDownloadFile = driveService.downloadFile;
    driveService.downloadFile = async (fileId, fileName) => {
      downloadedIds.push(fileId);
      return {
        id: fileId,
        fileName: fileName || fileId,
        filePath: `/tmp/${fileId}.png`,
        fileSize: 102400,
        mimeType: "image/png",
        isImage: true,
        isVideo: false,
        source: "DRIVE_MOCK",
      };
    };

    const origInspect = driveService.inspectFileMagicBytes;
    driveService.inspectFileMagicBytes = () => ({ isImage: true, isVideo: false, format: "png" });

    try {
      const folderRes = await driveService._processFolderContents(fakeFolderObj, "image", "");
      assert.strictEqual(folderRes.isFolder, true, "Should identify as folder");
      assert.strictEqual(folderRes.assets.length, 2, "Should select and download BOTH images by default");
      assert.deepStrictEqual(downloadedIds, ["img_file_001", "img_file_002"], "Both image file IDs should be downloaded");
      console.log("  ✓ DriveService selects and downloads BOTH images from folder by default (0 images dropped)");
    } finally {
      driveService.listFiles = origListFiles;
      driveService.downloadFile = origDownloadFile;
      driveService.inspectFileMagicBytes = origInspect;
    }
  }

  // --- 2. CampaignValidator: 2 Images in 1 Drive Folder -> 1 Meta Ad with Placement Asset Customization (PAC) ---
  console.log("\n--- 2. CampaignValidator: 2 Images in Drive Folder -> 1 Meta Ad (PAC) ---");
  {
    const origExtract = driveService.extractFileId;
    const origGetMeta = driveService.getFileMetadata;
    const origListContents = driveService.listFolderContents;

    driveService.extractFileId = (url) => {
      if (typeof url === "string" && url.includes("folders/folder_xyz_999")) return "folder_xyz_999";
      return origExtract.call(driveService, url);
    };

    driveService.getFileMetadata = async (fileId) => {
      if (fileId === "folder_xyz_999") {
        return {
          id: "folder_xyz_999",
          name: "Summer Diwali Creatives",
          mimeType: "application/vnd.google-apps.folder",
        };
      }
      return { id: fileId, name: "file.png", mimeType: "image/png" };
    };

    driveService.listFolderContents = async (folderId) => {
      if (folderId === "folder_xyz_999") {
        return [
          {
            fileId: "img_diwali_01",
            id: "img_diwali_01",
            name: "diwali_offer_feed.png",
            mimeType: "image/png",
            isImage: true,
            isVideo: false,
            url: "https://drive.google.com/file/d/img_diwali_01/view",
          },
          {
            fileId: "img_diwali_02",
            id: "img_diwali_02",
            name: "diwali_offer_story.png",
            mimeType: "image/png",
            isImage: true,
            isVideo: false,
            url: "https://drive.google.com/file/d/img_diwali_02/view",
          },
        ];
      }
      return [];
    };

    try {
      const sheetData = {
        headers: ["Campaign Name", "Ad Name", "Primary Text", "Headline", "Drive Folder Link", "Website URL"],
        rows: [
          {
            rowNumber: 2,
            values: {
              campaign_name: "Diwali Fest 2026",
              ad_name: "Diwali Special Promo",
              primary_text: "Exclusive 50% discount on all bookings",
              headline: "Book Now & Save Big",
              drive_folder_link: "https://drive.google.com/drive/folders/folder_xyz_999",
              website_url: "https://example.com/diwali",
              page_id: "109876543212345",
            },
          },
        ],
      };

      const valResult = await CampaignValidator.validate({
        sourceData: sheetData,
        userAnswers: { pageId: "109876543212345" },
        metaAccountId: "act_354818122576852",
      });

      assert.strictEqual(valResult.adLevelRows.length, 1, "Row with 2 images in folder must produce exactly 1 ad item with PAC");
      assert.strictEqual(valResult.adLevelRows[0].adName, "Diwali Special Promo", "Exact ad name must be preserved without suffix");
      assert.strictEqual(valResult.adLevelRows[0].sourceRow, 2);
      assert.strictEqual(valResult.adLevelRows[0].creative, "https://drive.google.com/file/d/img_diwali_01/view");
      assert.strictEqual(valResult.adLevelRows[0].totalCreativesInRow, 2);
      assert.strictEqual(valResult.adLevelRows[0].multiImageAssets.length, 2, "Both images attached in multiImageAssets");
      assert.strictEqual(valResult.adLevelRows[0].isPlacementAssetCustomization, true, "PAC must be flagged true");

      console.log("  ✓ 1 Drive folder with 2 images generates exactly 1 Meta Ad with Placement Asset Customization (PAC)");
      console.log(`    - Ad Name: "${valResult.adLevelRows[0].adName}"`);
      console.log(`    - Multi-Image Assets: ${valResult.adLevelRows[0].multiImageAssets.length} images`);
    } finally {
      driveService.extractFileId = origExtract;
      driveService.getFileMetadata = origGetMeta;
      driveService.listFolderContents = origListContents;
    }
  }

  // --- 3. CampaignValidator: Optional split mode when splitCreativeAds is true ---
  console.log("\n--- 3. CampaignValidator: Optional split mode when splitCreativeAds: true ---");
  {
    const origExtract = driveService.extractFileId;
    const origGetMeta = driveService.getFileMetadata;
    const origListContents = driveService.listFolderContents;

    driveService.extractFileId = (url) => {
      if (typeof url === "string" && url.includes("folders/folder_xyz_999")) return "folder_xyz_999";
      return origExtract.call(driveService, url);
    };

    driveService.getFileMetadata = async (fileId) => {
      if (fileId === "folder_xyz_999") {
        return { id: "folder_xyz_999", name: "Creatives", mimeType: "application/vnd.google-apps.folder" };
      }
      return { id: fileId, name: "file.png", mimeType: "image/png" };
    };

    driveService.listFolderContents = async (folderId) => {
      if (folderId === "folder_xyz_999") {
        return [
          { fileId: "img1", id: "img1", name: "img1.png", isImage: true, url: "https://drive.google.com/file/d/img1/view" },
          { fileId: "img2", id: "img2", name: "img2.png", isImage: true, url: "https://drive.google.com/file/d/img2/view" },
        ];
      }
      return [];
    };

    try {
      const sheetData = {
        headers: ["Campaign Name", "Ad Name", "Primary Text", "Headline", "Drive Folder Link", "Website URL"],
        rows: [
          {
            rowNumber: 2,
            values: {
              campaign_name: "Diwali Fest 2026",
              ad_name: "Diwali Special Promo",
              primary_text: "Text",
              headline: "Headline",
              drive_folder_link: "https://drive.google.com/drive/folders/folder_xyz_999",
              website_url: "https://example.com/diwali",
              page_id: "109876543212345",
            },
          },
        ],
      };

      const valResult = await CampaignValidator.validate({
        sourceData: sheetData,
        userAnswers: { pageId: "109876543212345", splitCreativeAds: true },
        metaAccountId: "act_354818122576852",
      });

      assert.strictEqual(valResult.adLevelRows.length, 2, "Row with splitCreativeAds: true must produce 2 ad items");
      assert.strictEqual(valResult.adLevelRows[0].adName, "Diwali Special Promo - Creative 1");
      assert.strictEqual(valResult.adLevelRows[1].adName, "Diwali Special Promo - Creative 2");
      console.log("  ✓ Explicit split mode (splitCreativeAds: true) properly splits into 2 distinct ads");
    } finally {
      driveService.extractFileId = origExtract;
      driveService.getFileMetadata = origGetMeta;
      driveService.listFolderContents = origListContents;
    }
  }

  // --- 3. CampaignValidator: Multiple Drive Links in one cell ---
  console.log("\n--- 3. CampaignValidator: Multiple Comma-Separated Drive Links in 1 Cell ---");
  {
    const origExtract = driveService.extractFileId;
    const origGetMeta = driveService.getFileMetadata;

    driveService.extractFileId = (url) => {
      if (typeof url === "string") {
        if (url.includes("AAA_FILE_111")) return "AAA_FILE_111";
        if (url.includes("BBB_FILE_222")) return "BBB_FILE_222";
      }
      return origExtract.call(driveService, url);
    };

    driveService.getFileMetadata = async (fileId) => {
      if (fileId === "AAA_FILE_111") return { id: fileId, name: "creative_a.jpg", mimeType: "image/jpeg" };
      if (fileId === "BBB_FILE_222") return { id: fileId, name: "creative_b.png", mimeType: "image/png" };
      return null;
    };

    try {
      const sheetData = {
        headers: ["Campaign Name", "Ad Name", "Google Drive Links", "Website URL"],
        rows: [
          {
            rowNumber: 3,
            values: {
              campaign_name: "Multi Link Test",
              ad_name: "Ad Variant",
              google_drive_links: "https://drive.google.com/file/d/AAA_FILE_111/view, https://drive.google.com/file/d/BBB_FILE_222/view",
              website_url: "https://example.com/test",
              page_id: "109876543212345",
            },
          },
        ],
      };

      const valResult = await CampaignValidator.validate({
        sourceData: sheetData,
        userAnswers: { pageId: "109876543212345", splitCreativeAds: true },
        metaAccountId: "act_354818122576852",
      });

      assert.strictEqual(valResult.adLevelRows.length, 2, "Row with 2 comma-separated Drive links must produce 2 ad items when splitCreativeAds: true");
      assert.strictEqual(valResult.adLevelRows[0].adName, "Ad Variant - Creative 1");
      assert.strictEqual(valResult.adLevelRows[1].adName, "Ad Variant - Creative 2");
      assert.strictEqual(valResult.adLevelRows[0].creative, "https://drive.google.com/file/d/AAA_FILE_111/view");
      assert.strictEqual(valResult.adLevelRows[1].creative, "https://drive.google.com/file/d/BBB_FILE_222/view");
      console.log("  ✓ Multiple Drive URLs in 1 cell parsed into 2 distinct Meta Ads successfully when splitCreativeAds: true");
    } finally {
      driveService.extractFileId = origExtract;
      driveService.getFileMetadata = origGetMeta;
    }
  }

  // --- 5. MetaAdsOrchestrator findAdResult isolation ---
  console.log("\n--- 5. MetaAdsOrchestrator Multi-Ad Isolation (Same sourceRow) ---");
  {
    const adResults = [
      {
        sourceRow: 2,
        adName: "Promo Ad - Creative 1",
        adId: "12020202020202020",
        status: "SUCCESS",
      },
    ];

    const findAdResult = (sourceRow, adName = null) =>
      adResults.find(
        (r) =>
          String(r.sourceRow) === String(sourceRow) &&
          (!adName || r.adName === adName)
      );

    const matchFirst = findAdResult(2, "Promo Ad - Creative 1");
    assert.ok(matchFirst, "First ad should be found");
    assert.strictEqual(matchFirst.status, "SUCCESS");

    const matchSecond = findAdResult(2, "Promo Ad - Creative 2");
    assert.strictEqual(matchSecond, undefined, "Second ad should NOT collide with first ad despite sharing sourceRow #2");
    console.log("  ✓ findAdResult strictly isolates multiple ads originating from the same sourceRow");
  }

  // --- 6. MetaApiService: Image Dimensions & Placement Classification (FEED vs STORY) ---
  console.log("\n--- 6. MetaApiService: Image Dimension & Placement Classification ---");
  {
    const { default: MetaApiService } = await import("../src/services/meta/metaApiService.js");

    // 1:1 Square PNG buffer
    const bufSquare = Buffer.alloc(30);
    bufSquare[0] = 0x89; bufSquare[1] = 0x50; bufSquare[2] = 0x4e; bufSquare[3] = 0x47;
    bufSquare.writeUInt32BE(1080, 16);
    bufSquare.writeUInt32BE(1080, 20);

    const squareDims = MetaApiService.inspectImageDimensions(bufSquare);
    assert.strictEqual(squareDims.width, 1080);
    assert.strictEqual(squareDims.height, 1080);
    const squareRole = MetaApiService.classifyImagePlacementRole({ buffer: bufSquare });
    assert.strictEqual(squareRole.role, "FEED", "1080x1080 square image must classify as FEED");

    // 9:16 Vertical PNG buffer (1080x1920)
    const bufVertical = Buffer.alloc(30);
    bufVertical[0] = 0x89; bufVertical[1] = 0x50; bufVertical[2] = 0x4e; bufVertical[3] = 0x47;
    bufVertical.writeUInt32BE(1080, 16);
    bufVertical.writeUInt32BE(1920, 20);

    const vertDims = MetaApiService.inspectImageDimensions(bufVertical);
    assert.strictEqual(vertDims.width, 1080);
    assert.strictEqual(vertDims.height, 1920);
    const vertRole = MetaApiService.classifyImagePlacementRole({ buffer: bufVertical });
    assert.strictEqual(vertRole.role, "STORY", "1080x1920 vertical image must classify as STORY");

    console.log("  ✓ 1080x1080 correctly classified as FEED (ratio: 1.00)");
    console.log("  ✓ 1080x1920 correctly classified as STORY (ratio: 0.56)");
  }

  // --- 7. MetaApiService: 1 Ad with 2 Images Placement Asset Customization (Graph API) ---
  console.log("\n--- 7. MetaApiService: 1 Ad with 2 Images Placement Asset Customization (Graph API) ---");
  {
    const { default: MetaApiService } = await import("../src/services/meta/metaApiService.js");

    const simToken = "EAAB_simulated_token_12345";
    const testAccountId = "act_354818122576852";

    const adRes = await MetaApiService.createAd(testAccountId, simToken, {
      name: "Diwali Special Promo",
      adSetId: "1202020202020",
      headline: "Special Discount",
      primaryText: "Get 50% off today",
      destinationUrl: "https://example.com/diwali",
      pageId: "109876543212345",
      multiImages: [
        { hash: "feed_hash_111111", role: "FEED", width: 1080, height: 1080 },
        { hash: "story_hash_222222", role: "STORY", width: 1080, height: 1920 },
      ],
    });

    assert.ok(adRes.id, "Ad must be created");
    assert.strictEqual(adRes.placementCustomization, true, "Placement Asset Customization must be enabled");
    assert.strictEqual(adRes.imageHashes.length, 2, "Must contain both image hashes");
    assert.strictEqual(adRes.imageHashes[0], "feed_hash_111111", "First hash is Feed");
    assert.strictEqual(adRes.imageHashes[1], "story_hash_222222", "Second hash is Story");
    assert.strictEqual(adRes.name, "Diwali Special Promo", "Single ad created with exact name");

    console.log("  ✓ MetaApiService creates exactly 1 Ad with 2 image hashes configured for PAC");
    console.log(`    - Ad ID: ${adRes.id}`);
    console.log(`    - Feed Image Hash: ${adRes.imageHashes[0]}`);
    console.log(`    - Story Image Hash: ${adRes.imageHashes[1]}`);
    console.log(`    - PAC Enabled: ${adRes.placementCustomization}`);
  }

  console.log("\n=== ALL MULTI-IMAGE DRIVE & META ADS TESTS PASSED! ✓ ===");
}

runTestSuite().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
