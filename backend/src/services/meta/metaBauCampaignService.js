// src/services/meta/metaBauCampaignService.js
/**
 * Unified 3-Level BAU (Business As Usual) Campaign Creation Service for Meta Marketing API v27.0
 * 
 * Executes strictly in sequence:
 * 1. Upload Media (if image_hash / video_id not already provided)
 * 2. Create Campaign (POST /v27.0/act_{AD_ACCOUNT_ID}/campaigns)
 * 3. Create Ad Set (POST /v27.0/act_{AD_ACCOUNT_ID}/adsets)
 * 4. Create Ad Creative(s) & Ad(s) (POST /v27.0/act_{AD_ACCOUNT_ID}/adcreatives and /ads)
 * 
 * Ad Creative Variations:
 * - Single ad (or ab_mode === "separate_ads"): creates single ad or V1 and V2 separate ads under the same Ad Set.
 * - Multi-text (ab_mode === "multi_text" with alt_headline): creates dynamic asset_feed_spec with DEGREES_OF_FREEDOM.
 * 
 * Always defaults status: "PAUSED" on every created object.
 * Returns partial state on any downstream failure so orphan objects are tracked and not duplicated.
 */

import axios from "axios";
import fs from "fs";
import path from "path";
import FormData from "form-data";
import MetaApiService from "./metaApiService.js";
import { cleanPageId } from "../data/fieldMapper.js";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v27.0";
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;
const GRAPH_VIDEO_BASE_URL = `https://graph-video.facebook.com/${GRAPH_VERSION}`;

/**
 * Normalizes Ad Account ID strictly to "act_<ID>"
 */
export function normalizeAdAccountId(id) {
  if (!id || typeof id !== "string") return null;
  const trimmed = id.trim();
  if (/^act_\d+$/.test(trimmed)) return trimmed;
  if (/^\d+$/.test(trimmed)) return `act_${trimmed}`;
  return null;
}

/**
 * Extracts and normalizes Meta Graph API error details
 */
export function extractMetaGraphError(err, stepName, createdState = {}) {
  const fbErr = err.response?.data?.error || {};
  return {
    success: false,
    failed_step: stepName,
    error: {
      message: fbErr.message || err.message || "Unknown Meta Graph API error",
      code: fbErr.code || err.code || null,
      error_subcode: fbErr.error_subcode || null,
      error_user_title: fbErr.error_user_title || null,
      error_user_msg: fbErr.error_user_msg || null,
      fbtrace_id: fbErr.fbtrace_id || null,
    },
    partial_state: {
      campaign_id: createdState.campaign_id || null,
      adset_id: createdState.adset_id || null,
      creative_ids: Array.isArray(createdState.creative_ids) ? createdState.creative_ids : [],
      ad_ids: Array.isArray(createdState.ad_ids) ? createdState.ad_ids : [],
      uploaded_media: createdState.uploaded_media || {},
    },
  };
}

export class MetaBauCampaignService {
  /**
   * Pre-flight checks before making any write calls to Meta Graph API
   */
  static validatePreFlight(params) {
    const {
      ad_account_id,
      page_id,
      targeting,
      daily_budget,
      campaign_daily_budget,
      headline,
      primary_text,
      landing_page_url,
    } = params;

    const normalizedAccountId = normalizeAdAccountId(ad_account_id);
    if (!normalizedAccountId) {
      throw new Error(
        `[Pre-Flight Validation Failed]: Invalid or missing "ad_account_id": "${ad_account_id}". Must be numeric or formatted as "act_<ID>".`
      );
    }

    const cleanedPageId = cleanPageId(page_id);
    if (!cleanedPageId) {
      throw new Error(
        `[Pre-Flight Validation Failed]: Missing required "page_id". A valid Facebook Page ID is required to create Meta Ad Creatives.`
      );
    }

    if (!targeting || typeof targeting !== "object") {
      throw new Error(`[Pre-Flight Validation Failed]: "targeting" object is required.`);
    }

    const geo = targeting.geo_locations;
    const hasGeo =
      geo &&
      typeof geo === "object" &&
      ((Array.isArray(geo.countries) && geo.countries.length > 0) ||
        (Array.isArray(geo.regions) && geo.regions.length > 0) ||
        (Array.isArray(geo.cities) && geo.cities.length > 0) ||
        (Array.isArray(geo.custom_locations) && geo.custom_locations.length > 0));

    if (!hasGeo) {
      throw new Error(
        `[Pre-Flight Validation Failed]: "targeting.geo_locations" must be non-empty (e.g. { countries: ["IN"] }).`
      );
    }

    const numCampBudget = Number(campaign_daily_budget);
    const numAdSetBudget = Number(daily_budget);
    const hasValidBudget =
      (Number.isFinite(numCampBudget) && numCampBudget > 0) ||
      (Number.isFinite(numAdSetBudget) && numAdSetBudget > 0);

    if (!hasValidBudget) {
      throw new Error(
        `[Pre-Flight Validation Failed]: Either "daily_budget" (for Ad Set) or "campaign_daily_budget" (for CBO Campaign) must be a positive integer in smallest currency units (e.g. paise/cents).`
      );
    }

    if (!headline || typeof headline !== "string" || !headline.trim()) {
      throw new Error(`[Pre-Flight Validation Failed]: "headline" is required for ad creative.`);
    }

    if (!primary_text || typeof primary_text !== "string" || !primary_text.trim()) {
      throw new Error(`[Pre-Flight Validation Failed]: "primary_text" is required for ad creative.`);
    }

    if (!landing_page_url || typeof landing_page_url !== "string" || !landing_page_url.trim()) {
      throw new Error(`[Pre-Flight Validation Failed]: "landing_page_url" is required for ad creative destination.`);
    }

    return {
      normalizedAccountId,
      cleanedPageId,
    };
  }

  /**
   * Uploads image media to /v27.0/act_{AD_ACCOUNT_ID}/adimages
   */
  static async uploadImageMedia(adAccountId, accessToken, { mediaUrl, mediaFile, imageHash }) {
    if (imageHash) return imageHash;

    const target = mediaFile || mediaUrl;
    if (!target) {
      throw new Error("No image_hash, media_file, or media_url provided for image creative.");
    }

    if (accessToken && accessToken.startsWith("EAAB_simulated")) {
      return `sim_img_hash_${Date.now()}`;
    }

    const cleanId = normalizeAdAccountId(adAccountId);
    const url = `${GRAPH_BASE_URL}/${cleanId}/adimages`;

    // Local file path
    if (typeof target === "string" && fs.existsSync(target)) {
      const form = new FormData();
      form.append("filename", fs.createReadStream(target));
      form.append("access_token", accessToken);
      const res = await axios.post(url, form, { headers: form.getHeaders(), timeout: 60000 });
      const images = res.data?.images || {};
      const first = Object.values(images)[0];
      return first?.hash || res.data?.hash;
    }

    // Google Drive URL
    if (typeof target === "string" && (target.includes("drive.google.com") || target.includes("docs.google.com"))) {
      const { default: driveService } = await import("../../google/driveService.js");
      const dl = await driveService.downloadFile(target);
      if (dl?.filePath && fs.existsSync(dl.filePath)) {
        const form = new FormData();
        form.append("filename", fs.createReadStream(dl.filePath));
        form.append("access_token", accessToken);
        const res = await axios.post(url, form, { headers: form.getHeaders(), timeout: 60000 });
        const images = res.data?.images || {};
        const first = Object.values(images)[0];
        return first?.hash || res.data?.hash;
      }
    }

    // Remote HTTP/HTTPS URL
    if (typeof target === "string" && (target.startsWith("http://") || target.startsWith("https://"))) {
      const res = await axios.post(url, null, {
        params: { url: target, access_token: accessToken },
        timeout: 60000,
      });
      const images = res.data?.images || {};
      const first = Object.values(images)[0];
      return first?.hash || res.data?.hash;
    }

    throw new Error(`Unable to resolve or upload image asset from "${target}".`);
  }

  /**
   * Uploads video media to /v27.0/act_{AD_ACCOUNT_ID}/advideos
   */
  static async uploadVideoMedia(adAccountId, accessToken, { mediaUrl, mediaFile, videoId, thumbnailHash }) {
    let resolvedVideoId = videoId || null;
    let resolvedThumbnailHash = thumbnailHash || null;

    if (accessToken && accessToken.startsWith("EAAB_simulated")) {
      return {
        videoId: resolvedVideoId || `sim_vid_${Date.now()}`,
        thumbnailHash: resolvedThumbnailHash || `sim_thumb_${Date.now()}`,
      };
    }

    const cleanId = normalizeAdAccountId(adAccountId);
    const target = mediaFile || mediaUrl;

    if (!resolvedVideoId) {
      if (!target) {
        throw new Error("No video_id, media_file, or media_url provided for video creative.");
      }

      let localVideoPath = null;
      if (typeof target === "string" && fs.existsSync(target)) {
        localVideoPath = target;
      } else if (typeof target === "string" && (target.includes("drive.google.com") || target.includes("docs.google.com"))) {
        const { default: driveService } = await import("../../google/driveService.js");
        const dl = await driveService.downloadFile(target);
        if (dl?.filePath && fs.existsSync(dl.filePath)) {
          localVideoPath = dl.filePath;
        }
      }

      if (localVideoPath && fs.existsSync(localVideoPath)) {
        // Upload via chunked resumable endpoint
        const videoRes = await MetaApiService.uploadVideoChunked(cleanId, accessToken, localVideoPath, {
          title: "BAU Video Creative",
        });
        resolvedVideoId = videoRes?.id || videoRes?.video_id;

        // Auto extract thumbnail if missing
        if (!resolvedThumbnailHash) {
          try {
            const thumbPath = await MetaApiService.extractVideoThumbnail(localVideoPath);
            if (thumbPath && fs.existsSync(thumbPath)) {
              const thumbUpload = await MetaApiService.uploadAdImage(cleanId, accessToken, { filePath: thumbPath });
              resolvedThumbnailHash = thumbUpload?.hash || null;
            }
          } catch (tErr) {
            console.warn("[Meta BAU Video Thumbnail Warning]:", tErr.message);
          }
        }
      } else if (typeof target === "string" && (target.startsWith("http://") || target.startsWith("https://"))) {
        const videoUrl = `${GRAPH_VIDEO_BASE_URL}/${cleanId}/advideos`;
        const res = await axios.post(videoUrl, null, {
          params: { file_url: target, access_token: accessToken },
          timeout: 120000,
        });
        resolvedVideoId = res.data?.id;
      }
    }

    // Fallback thumbnail hash if still missing (Meta requires image_hash or image_url on video creatives)
    if (!resolvedThumbnailHash) {
      try {
        const fallbackPng = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          "base64"
        );
        const imgUploadRes = await MetaApiService.uploadAdImage(cleanId, accessToken, {
          imageBuffer: fallbackPng,
          adName: "video_poster",
        });
        resolvedThumbnailHash = imgUploadRes?.hash || null;
      } catch (fbErr) {
        console.warn("[Meta BAU Video Thumbnail Fallback Notice]:", fbErr.message);
      }
    }

    return {
      videoId: resolvedVideoId,
      thumbnailHash: resolvedThumbnailHash,
    };
  }

  /**
   * Main Handler: Executes the unified 3-level BAU campaign creation sequentially
   */
  static async createBauCampaign(params = {}, context = {}) {
    const createdState = {
      campaign_id: null,
      adset_id: null,
      creative_ids: [],
      ad_ids: [],
      ad_names: [],
      status: "PAUSED",
      uploaded_media: {
        image_hash: null,
        video_id: null,
        thumbnail_hash: null,
      },
    };

    let normalizedAccountId = null;
    let cleanedPageId = null;

    try {
      // 0. Pre-Flight Validation
      const preFlight = this.validatePreFlight(params);
      normalizedAccountId = preFlight.normalizedAccountId;
      cleanedPageId = preFlight.cleanedPageId;

      // Token Resolution
      const effectiveUserId = context.userId || params.userId || null;
      const accessToken = await MetaApiService.resolveOAuthToken(
        normalizedAccountId,
        effectiveUserId,
        params.access_token || params.accessToken
      );

      if (!accessToken) {
        throw new Error(
          `No active Meta OAuth Access Token found for account "${normalizedAccountId}". Please connect your Meta Ads account in Channels.`
        );
      }

      const isSimulated = accessToken.startsWith("EAAB_simulated");

      // Extract Parameters
      const {
        campaign_name,
        objective = "OUTCOME_SALES",
        special_ad_categories = [],
        buying_type = "AUCTION",
        campaign_daily_budget,
        adset_name,
        optimization_goal,
        billing_event = "IMPRESSIONS",
        daily_budget,
        bid_strategy = "LOWEST_COST_WITHOUT_CAP",
        destination_type = "WEBSITE",
        promoted_object,
        attribution_spec,
        attribution_setting,
        attributionSetting,
        attributionSpec,
        targeting,
        ad_name,
        media_type = "image",
        media_url,
        media_file,
        image_hash,
        video_id,
        thumbnail_hash,
        landing_page_url,
        call_to_action = "BOOK_NOW",
        primary_text,
        headline,
        alt_headline,
        description,
        ab_mode = "separate_ads",
        instagram_user_id,
      } = params;

      // 1. Step 1: Upload Media
      let effectiveImageHash = image_hash || null;
      let effectiveVideoId = video_id || null;
      let effectiveThumbnailHash = thumbnail_hash || null;

      try {
        if (media_type === "image") {
          effectiveImageHash = await this.uploadImageMedia(normalizedAccountId, accessToken, {
            mediaUrl: media_url,
            mediaFile: media_file,
            imageHash: image_hash,
          });
          createdState.uploaded_media.image_hash = effectiveImageHash;
        } else if (media_type === "video") {
          const vidResult = await this.uploadVideoMedia(normalizedAccountId, accessToken, {
            mediaUrl: media_url,
            mediaFile: media_file,
            videoId: video_id,
            thumbnailHash: thumbnail_hash,
          });
          effectiveVideoId = vidResult.videoId;
          effectiveThumbnailHash = vidResult.thumbnailHash;
          createdState.uploaded_media.video_id = effectiveVideoId;
          createdState.uploaded_media.thumbnail_hash = effectiveThumbnailHash;
        }
      } catch (mediaErr) {
        return extractMetaGraphError(mediaErr, "UPLOAD_MEDIA", createdState);
      }

      // 2. Step 2: Create Campaign (POST /v27.0/act_{AD_ACCOUNT_ID}/campaigns)
      try {
        if (isSimulated) {
          createdState.campaign_id = `sim_camp_${Date.now()}`;
        } else {
          const campaignUrl = `${GRAPH_BASE_URL}/${normalizedAccountId}/campaigns`;
          const campaignPayload = {
            name: MetaApiService.truncateToMaxBytes(campaign_name, 1000),
            objective,
            special_ad_categories: JSON.stringify(special_ad_categories || []),
            buying_type: buying_type || "AUCTION",
            status: "PAUSED",
            access_token: accessToken,
          };

          if (campaign_daily_budget && Number(campaign_daily_budget) > 0) {
            campaignPayload.daily_budget = Math.round(Number(campaign_daily_budget));
            campaignPayload.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
          }

          const campRes = await axios.post(campaignUrl, null, { params: campaignPayload });
          createdState.campaign_id = campRes.data?.id;
          if (!createdState.campaign_id) {
            throw new Error("Meta Graph API returned success but missing campaign id.");
          }
        }
      } catch (campErr) {
        return extractMetaGraphError(campErr, "CREATE_CAMPAIGN", createdState);
      }

      // 3. Step 3: Create Ad Set (POST /v27.0/act_{AD_ACCOUNT_ID}/adsets)
      try {
        if (isSimulated) {
          createdState.adset_id = `sim_adset_${Date.now()}`;
        } else {
          const adsetUrl = `${GRAPH_BASE_URL}/${normalizedAccountId}/adsets`;
          const adsetPayload = {
            name: MetaApiService.truncateToMaxBytes(adset_name, 1000),
            campaign_id: createdState.campaign_id,
            optimization_goal,
            billing_event: billing_event || "IMPRESSIONS",
            bid_strategy: bid_strategy || "LOWEST_COST_WITHOUT_CAP",
            status: "PAUSED",
            access_token: accessToken,
          };

          // If not CBO, pass ad set level budget
          if ((!campaign_daily_budget || Number(campaign_daily_budget) <= 0) && daily_budget && Number(daily_budget) > 0) {
            adsetPayload.daily_budget = Math.round(Number(daily_budget));
          }

          if (destination_type) {
            adsetPayload.destination_type = destination_type;
          }

          if (promoted_object && typeof promoted_object === "object") {
            adsetPayload.promoted_object = JSON.stringify(promoted_object);
          }

          // Resolve effective attribution spec (support params, aliases, and AiContext fallback)
          let rawAttr = attribution_spec || attributionSpec || attribution_setting || attributionSetting || null;
          const effectiveUserId = params.userId || context?.userId;
          if (!rawAttr && effectiveUserId) {
            try {
              const AiContext = (await import("../../models/aiContextModel.js")).default;
              const aiContextDoc = await AiContext.findOne({ userId: effectiveUserId }).lean().catch(() => null);
              const channelNodes = (aiContextDoc?.nodes || []).filter((n) => n.type === "ad_channel");
              const foundNode = channelNodes.find((n) => n.data?.attribution_setting || n.data?.funnels?.[0]?.attribution_setting);
              if (foundNode) {
                rawAttr = foundNode.data?.attribution_setting || foundNode.data?.funnels?.[0]?.attribution_setting;
              }
            } catch (_) {}
          }
          if (!rawAttr) {
            rawAttr = "7_DAY_CLICK_1_DAY_VIEW";
          }

          const effectiveSpec = MetaApiService.normalizeAttributionSpec(rawAttr);
          if (effectiveSpec && effectiveSpec.length > 0) {
            adsetPayload.attribution_spec = JSON.stringify(effectiveSpec);
          }

          if (targeting && typeof targeting === "object") {
            adsetPayload.targeting = JSON.stringify(targeting);
          }

          let adsetRes;
          try {
            adsetRes = await axios.post(adsetUrl, null, { params: adsetPayload });
          } catch (firstAdsetErr) {
            const errMsg = firstAdsetErr?.response?.data?.error?.message || firstAdsetErr.message || "";
            if ((errMsg.includes("attribution_spec") || errMsg.includes("attribution spec")) && adsetPayload.attribution_spec) {
              console.warn("[Meta BAU AdSet Attribution Fallback]: Retrying with safe 7d click + 1d view...");
              const retryPayload = { ...adsetPayload };
              retryPayload.attribution_spec = JSON.stringify([
                { event_type: "CLICK_THROUGH", window_days: 7 },
                { event_type: "VIEW_THROUGH", window_days: 1 },
              ]);
              try {
                adsetRes = await axios.post(adsetUrl, null, { params: retryPayload });
              } catch (secondAdsetErr) {
                const errMsg2 = secondAdsetErr?.response?.data?.error?.message || secondAdsetErr.message || "";
                if (errMsg2.includes("attribution_spec") || errMsg2.includes("attribution spec")) {
                  console.warn("[Meta BAU AdSet Attribution Fallback 2]: Retrying without attribution_spec...");
                  const retryPayload2 = { ...adsetPayload };
                  delete retryPayload2.attribution_spec;
                  adsetRes = await axios.post(adsetUrl, null, { params: retryPayload2 });
                } else {
                  throw secondAdsetErr;
                }
              }
            } else {
              throw firstAdsetErr;
            }
          }
          createdState.adset_id = adsetRes.data?.id;
          if (!createdState.adset_id) {
            throw new Error("Meta Graph API returned success but missing adset id.");
          }
        }
      } catch (adsetErr) {
        return extractMetaGraphError(adsetErr, "CREATE_AD_SET", createdState);
      }

      // 4. Step 4: Create Ad Creative(s) & Ad(s)
      const cleanLink = MetaApiService.sanitizeLinkUrl(landing_page_url);
      const effectiveCta = MetaApiService.normalizeCallToAction(call_to_action || "BOOK_NOW");
      const creativeUrl = `${GRAPH_BASE_URL}/${normalizedAccountId}/adcreatives`;
      const adsUrl = `${GRAPH_BASE_URL}/${normalizedAccountId}/ads`;

      // Helper to create a single Ad Creative and corresponding Ad
      const createSingleAdWithCreative = async (creativeTitle, adTitle, adSuffix = "") => {
        let creativeId = null;
        let adId = null;

        if (isSimulated) {
          creativeId = `sim_cr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          adId = `sim_ad_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        } else {
          // Build object_story_spec
          let objectStorySpec = {
            page_id: cleanedPageId,
            ...(instagram_user_id ? { instagram_user_id } : {}),
          };

          if (media_type === "video") {
            objectStorySpec.video_data = {
              video_id: effectiveVideoId,
              ...(effectiveThumbnailHash ? { image_hash: effectiveThumbnailHash } : {}),
              message: primary_text,
              title: MetaApiService.truncateToMaxBytes(adTitle, 250),
              ...(description ? { link_description: description } : {}),
              call_to_action: {
                type: effectiveCta,
                value: { link: cleanLink },
              },
            };
          } else {
            // Default Image Ad
            objectStorySpec.link_data = {
              image_hash: effectiveImageHash,
              link: cleanLink,
              message: primary_text,
              name: MetaApiService.truncateToMaxBytes(adTitle, 250),
              ...(description ? { description } : {}),
              call_to_action: {
                type: effectiveCta,
                value: { link: cleanLink },
              },
            };
          }

          const creativePayload = {
            name: MetaApiService.truncateToMaxBytes(`${ad_name}${adSuffix} Creative`, 1000),
            object_story_spec: JSON.stringify(objectStorySpec),
            access_token: accessToken,
          };

          const crRes = await axios.post(creativeUrl, null, { params: creativePayload });
          creativeId = crRes.data?.id;
          if (!creativeId) throw new Error("Meta Graph API returned success but missing creative id.");

          // Create Ad
          const effectiveAdName = `${ad_name}${adSuffix}`;
          const adPayload = {
            name: MetaApiService.truncateToMaxBytes(effectiveAdName, 1000),
            adset_id: createdState.adset_id,
            creative: JSON.stringify({ creative_id: creativeId }),
            status: "PAUSED",
            access_token: accessToken,
          };

          const adRes = await axios.post(adsUrl, null, { params: adPayload });
          adId = adRes.data?.id;
          if (!adId) throw new Error("Meta Graph API returned success but missing ad id.");
        }

        createdState.creative_ids.push(creativeId);
        createdState.ad_ids.push(adId);
        createdState.ad_names.push(`${ad_name}${adSuffix}`);
      };

      try {
        const hasAltHeadline = Boolean(alt_headline && typeof alt_headline === "string" && alt_headline.trim());

        if (hasAltHeadline && ab_mode === "multi_text") {
          // Dynamic Creative (DEGREES_OF_FREEDOM multi-text)
          if (isSimulated) {
            createdState.creative_ids.push(`sim_cr_dof_${Date.now()}`);
            createdState.ad_ids.push(`sim_ad_dof_${Date.now()}`);
            createdState.ad_names.push(ad_name);
          } else {
            const assetFeedSpec = {
              optimization_type: "DEGREES_OF_FREEDOM",
              bodies: [{ text: primary_text }],
              titles: [{ text: headline }, { text: alt_headline.trim() }],
              descriptions: description ? [{ text: description }] : [],
              link_urls: [{ website_url: cleanLink }],
              call_to_action_types: [effectiveCta],
              images: media_type === "image" && effectiveImageHash ? [{ hash: effectiveImageHash }] : [],
              videos:
                media_type === "video" && effectiveVideoId
                  ? [{ video_id: effectiveVideoId, ...(effectiveThumbnailHash ? { thumbnail_hash: effectiveThumbnailHash } : {}) }]
                  : [],
            };

            const dofCreativePayload = {
              name: MetaApiService.truncateToMaxBytes(`${ad_name} Multi-Text Creative`, 1000),
              object_story_spec: JSON.stringify({
                page_id: cleanedPageId,
                ...(instagram_user_id ? { instagram_user_id } : {}),
              }),
              asset_feed_spec: JSON.stringify(assetFeedSpec),
              access_token: accessToken,
            };

            const dofRes = await axios.post(creativeUrl, null, { params: dofCreativePayload });
            const dofCreativeId = dofRes.data?.id;
            if (!dofCreativeId) throw new Error("Meta Graph API returned success but missing creative id.");

            const adPayload = {
              name: MetaApiService.truncateToMaxBytes(ad_name, 1000),
              adset_id: createdState.adset_id,
              creative: JSON.stringify({ creative_id: dofCreativeId }),
              status: "PAUSED",
              access_token: accessToken,
            };

            const adRes = await axios.post(adsUrl, null, { params: adPayload });
            const adId = adRes.data?.id;
            if (!adId) throw new Error("Meta Graph API returned success but missing ad id.");

            createdState.creative_ids.push(dofCreativeId);
            createdState.ad_ids.push(adId);
            createdState.ad_names.push(ad_name);
          }
        } else if (hasAltHeadline && ab_mode === "separate_ads") {
          // A/B Test: 2 separate ads under the same ad set
          await createSingleAdWithCreative("V1 Creative", headline, " - V1");
          await createSingleAdWithCreative("V2 Creative", alt_headline.trim(), " - V2");
        } else {
          // Standard Single Ad
          await createSingleAdWithCreative("Creative", headline, "");
        }
      } catch (adErr) {
        return extractMetaGraphError(adErr, "CREATE_AD_OR_CREATIVE", createdState);
      }

      return {
        success: true,
        campaign_id: createdState.campaign_id,
        adset_id: createdState.adset_id,
        creative_ids: createdState.creative_ids,
        ad_ids: createdState.ad_ids,
        status: "PAUSED",
        details: {
          ad_account_id: normalizedAccountId,
          page_id: cleanedPageId,
          campaign_name,
          adset_name,
          ad_names: createdState.ad_names,
          ab_mode: alt_headline ? ab_mode : "none",
          media_type,
          uploaded_media: createdState.uploaded_media,
        },
        summary: `Successfully created BAU Campaign hierarchy:\n- Campaign: ${campaign_name} (${createdState.campaign_id})\n- Ad Set: ${adset_name} (${createdState.adset_id})\n- Creative(s): ${createdState.creative_ids.join(", ")}\n- Ad(s): ${createdState.ad_ids.join(", ")} (status: PAUSED)`,
      };
    } catch (fatalErr) {
      return extractMetaGraphError(fatalErr, "PRE_FLIGHT_OR_SETUP", createdState);
    }
  }
}

export default MetaBauCampaignService;
