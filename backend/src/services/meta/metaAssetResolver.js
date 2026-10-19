// src/services/meta/metaAssetResolver.js
import axios from "axios";

const META_GRAPH_URL = "https://graph.facebook.com/v24.0";

/**
 * MetaAssetResolver: Centralized, Shared Dynamic Asset Resolution Service
 * 
 * Rules:
 * 1. Zero Hardcoding: No hardcoded Page IDs, Pixel IDs, App IDs, Instagram IDs, or Account IDs.
 * 2. Dynamic Discovery: Uses authenticated Meta Graph API to verify actual permissions and accessible assets.
 * 3. Page Resolution: Verifies that the Page actually has advertising permission (ADVERTISE task or in promote_pages).
 *    - Prefers user-intended Page if authorized.
 *    - If unauthorized (e.g. Meta Error 10 / Subcode 3858749), dynamically resolves appropriate authorized alternative.
 *    - If no authorized Page is available, stops with an actionable, user-friendly blocker message without repeated retries.
 * 4. Pixel Resolution: Verifies pixel association with ad account; resolves unambiguous alternative if single; blocks with clarification if ambiguous.
 * 5. App Resolution: Treats App ID as optional for website conversion campaigns (OUTCOME_SALES), omitting unlinked apps without blocking ads.
 * 6. Instagram Resolution: Verifies linked Instagram business accounts; cleanly omits unlinked optional Instagram accounts.
 */
export class MetaAssetResolver {
  static userPagesCache = new Map();
  static promotePagesCache = new Map();

  /**
   * Fetch promotable pages associated with an Ad Account (/act_<id>/promote_pages)
   */
  static async getPromotePages(accountId, accessToken) {
    if (!accessToken || !accountId) return [];
    const cleanId = String(accountId).startsWith("act_") ? accountId : `act_${accountId}`;
    const cacheKey = `${cleanId}_${String(accessToken).slice(-15)}`;
    const cached = this.promotePagesCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    try {
      const url = `${META_GRAPH_URL}/${cleanId}/promote_pages`;
      const response = await axios.get(url, {
        params: {
          access_token: accessToken,
          fields: "id,name",
          limit: 50,
        },
      });
      const data = response.data?.data || [];
      this.promotePagesCache.set(cacheKey, { data, expiresAt: Date.now() + 5 * 60 * 1000 });
      return data;
    } catch (err) {
      console.warn(`[MetaAssetResolver getPromotePages]: ${err.response?.data?.error?.message || err.message}`);
      if (cached?.data) return cached.data;
      return [];
    }
  }

  /**
   * Fetch managed Facebook Pages with tasks and permissions (/me/accounts)
   */
  static async getUserPages(accessToken) {
    if (!accessToken) return [];
    const cacheKey = String(accessToken).slice(-20);
    const cached = this.userPagesCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    try {
      const url = `${META_GRAPH_URL}/me/accounts`;
      const response = await axios.get(url, {
        params: {
          access_token: accessToken,
          fields: "id,name,category,access_token,tasks",
          limit: 100,
        },
      });
      const data = response.data?.data || [];
      this.userPagesCache.set(cacheKey, { data, expiresAt: Date.now() + 5 * 60 * 1000 });
      return data;
    } catch (err) {
      console.warn(`[MetaAssetResolver getUserPages]: ${err.response?.data?.error?.message || err.message}`);
      if (cached?.data) return cached.data;
      return [];
    }
  }

  /**
   * Safe Diagnostic Logger: Outputs structured diagnostic identifying
   * selected account, sheet page, resolved page, accessibility, authorization, and failure pipeline step.
   * STRICT: Never logs access tokens, app secrets, or sensitive credentials.
   */
  static logPageDiagnostic({
    selectedAccountId,
    sheetPageId,
    resolvedPageId,
    isAccessible = false,
    isAuthorized = false,
    failureStep = "PAGE_VALIDATION",
    status = "UNKNOWN",
    details = "",
  }) {
    console.log(`\n==================== META PAGE ASSET DIAGNOSTIC ====================`);
    console.log(`  - Selected Ad Account ID : ${selectedAccountId || "(None selected)"}`);
    console.log(`  - Sheet-Provided Page ID : ${sheetPageId || "(None provided in row)"}`);
    console.log(`  - Resolved Page ID       : ${resolvedPageId || "(None resolved)"}`);
    console.log(`  - Page Accessible        : ${isAccessible ? "YES" : "NO"}`);
    console.log(`  - Page Authorized for Ads: ${isAuthorized ? "YES" : "NO"}`);
    console.log(`  - Pipeline Step          : ${failureStep}`);
    console.log(`  - Resolution Status      : ${status}`);
    if (details) {
      console.log(`  - Diagnostic Detail      : ${String(details).replace(/[\r\n]+/g, " ").trim()}`);
    }
    console.log(`====================================================================\n`);
  }

  /**
   * Verify and dynamically resolve a valid Facebook Page ID with Ads permission
   * 
   * Priority Rules:
   * 1. If sheet's page_id is present and accessible & authorized for advertising with selected account -> Use it (VERIFIED).
   * 2. If sheet's page_id is missing/empty -> Dynamically discover authorized Pages on selected account (DISCOVERED_SINGLE_ACCOUNT_ASSET).
   * 3. If a valid authorized Page is available and fallback is explicitly allowed/consistent -> Log fallback Page selected (FALLBACK_PAGE_SELECTED).
   * 4. If sheet explicitly specifies an unauthorized/conflicting Page and no fallback approved -> Report mismatch, DO NOT silently override (PAGE_PERMISSION_MISSING / PAGE_ACCOUNT_MISMATCH).
   * 5. If no suitable Page is authorized on account -> Stop row with clear actionable error without infinite retries (PAGE_PERMISSION_MISSING / PAGE_NOT_FOUND).
   */
  static async verifyAndResolvePageAsset({ accountId, accessToken, requestedPageId, allowFallbackPage = false }) {
    const cleanId = accountId ? (String(accountId).startsWith("act_") ? accountId : `act_${accountId}`) : null;
    const cleanRequestedId = requestedPageId ? String(requestedPageId).trim() : null;

    if (accessToken && accessToken.startsWith("EAAB_simulated")) {
      const simPageId = cleanRequestedId || "simulated_page_default";
      return {
        valid: true,
        pageId: simPageId,
        pageName: "Simulated Page",
        status: "VERIFIED_SIMULATED",
      };
    }

    // 1. Fetch available Pages from both Ad Account promote_pages and User me/accounts
    let promotePages = [];
    let userPages = [];

    if (accessToken) {
      const [pPages, uPages] = await Promise.all([
        cleanId ? this.getPromotePages(cleanId, accessToken) : Promise.resolve([]),
        this.getUserPages(accessToken),
      ]);
      promotePages = pPages || [];
      userPages = uPages || [];
    }

    // Determine authorized pages:
    // A page is authorized if:
    // a) It is in the Ad Account's promote_pages list, OR
    // b) The user has 'ADVERTISE' or 'MANAGE' tasks in /me/accounts
    const authorizedPageMap = new Map();

    for (const p of userPages) {
      const tasks = Array.isArray(p.tasks) ? p.tasks.map((t) => String(t).toUpperCase()) : [];
      const hasAdsPermission = tasks.includes("ADVERTISE") || tasks.includes("MANAGE");
      if (hasAdsPermission && p.id) {
        authorizedPageMap.set(String(p.id), {
          id: String(p.id),
          name: p.name || `Page ${p.id}`,
          source: "USER_MANAGED_WITH_ADVERTISE_PERMISSION",
          tasks,
        });
      }
    }

    for (const p of promotePages) {
      if (p.id) {
        if (!authorizedPageMap.has(String(p.id))) {
          authorizedPageMap.set(String(p.id), {
            id: String(p.id),
            name: p.name || `Page ${p.id}`,
            source: "AD_ACCOUNT_PROMOTE_PAGE",
            tasks: ["ADVERTISE"],
          });
        }
      }
    }

    const authorizedPages = Array.from(authorizedPageMap.values());

    // Priority 1: Page ID explicitly requested and authorized on selected account
    if (cleanRequestedId) {
      const match = authorizedPages.find((p) => String(p.id) === cleanRequestedId);
      if (match) {
        const result = {
          valid: true,
          pageId: cleanRequestedId,
          pageName: match.name,
          status: "VERIFIED",
          source: match.source,
          blocked: false,
          isAccessible: true,
          isAuthorized: true,
          message: `Facebook Page "${match.name}" [${cleanRequestedId}] is verified and authorized for advertising on Ad Account ${cleanId}.`,
        };
        this.logPageDiagnostic({
          selectedAccountId: cleanId,
          sheetPageId: cleanRequestedId,
          resolvedPageId: cleanRequestedId,
          isAccessible: true,
          isAuthorized: true,
          failureStep: "PAGE_VALIDATION",
          status: "VERIFIED",
          details: result.message,
        });
        return result;
      }

      // The requested Page is NOT authorized for advertising!
      // Check if user has access to this Page at all
      const userMatch = userPages.find((p) => String(p.id) === cleanRequestedId);
      const isAccessible = Boolean(userMatch);

      // Priority 3: Fallback Page allowed and available
      if (allowFallbackPage && authorizedPages.length > 0) {
        const preferredAlt =
          authorizedPages.find((p) => p.tasks && p.tasks.includes("ADVERTISE") && p.source === "USER_MANAGED_WITH_ADVERTISE_PERMISSION") ||
          authorizedPages.find((p) => p.source === "USER_MANAGED_WITH_ADVERTISE_PERMISSION") ||
          authorizedPages.find((p) => p.source === "AD_ACCOUNT_PROMOTE_PAGE") ||
          authorizedPages[0];
        const logMsg = `Fallback Page selected: Using authorized Page "${preferredAlt.name}" [${preferredAlt.id}] instead of unauthorized requested Page "${cleanRequestedId}".`;
        console.warn(`⚠️ [Meta Page Resolver Warning]: ${logMsg}`);
        const result = {
          valid: true,
          pageId: preferredAlt.id,
          pageName: preferredAlt.name,
          status: "FALLBACK_PAGE_SELECTED",
          source: preferredAlt.source,
          blocked: false,
          isAccessible,
          isAuthorized: true,
          originalRequestedPageId: cleanRequestedId,
          message: logMsg,
        };
        this.logPageDiagnostic({
          selectedAccountId: cleanId,
          sheetPageId: cleanRequestedId,
          resolvedPageId: preferredAlt.id,
          isAccessible,
          isAuthorized: true,
          failureStep: "PAGE_VALIDATION",
          status: "FALLBACK_PAGE_SELECTED",
          details: logMsg,
        });
        return result;
      }

      // Priority 4: Sheet explicitly specifies a Page that conflicts or lacks Ads permission.
      // Do NOT silently override without authorization!
      if (isAccessible) {
        // Page is accessible by user, but lacks ADVERTISE/MANAGE task (Meta Error 10 / Subcode 3858749)
        const result = {
          valid: false,
          pageId: cleanRequestedId,
          pageName: userMatch?.name || null,
          status: "PAGE_PERMISSION_MISSING",
          blocked: true,
          isAccessible: true,
          isAuthorized: false,
          errorCode: 10,
          subcode: 3858749,
          requiredAction: `The connected Meta user has access to Facebook Page "${userMatch?.name || cleanRequestedId}" [${cleanRequestedId}], but lacks "Ads" advertising permission (Meta Error 10 / Subcode 3858749). The Page administrator must grant "Advertise" permission to this user in Meta Business Manager, or specify an authorized Page.`,
          error: `Missing Page permission [Meta Error 10 / Subcode 3858749]: Facebook Page "${userMatch?.name || cleanRequestedId}" [${cleanRequestedId}] lacks required Ads permission for selected Ad Account ${cleanId}.`,
        };
        this.logPageDiagnostic({
          selectedAccountId: cleanId,
          sheetPageId: cleanRequestedId,
          resolvedPageId: null,
          isAccessible: true,
          isAuthorized: false,
          failureStep: "PAGE_VALIDATION",
          status: "PAGE_PERMISSION_MISSING",
          details: result.error,
        });
        return result;
      }

      // Page is not accessible or does not belong to selected ad account context
      // Resilient check: If userPages or promotePages was empty (due to rate limits like #4 Application request limit reached or restricted API scope),
      // and cleanRequestedId is provided by the user/sheet, trust the explicit Page ID rather than falsely blocking creation.
      if (cleanRequestedId && (userPages.length === 0 || promotePages.length === 0)) {
        console.warn(`⚠️ [MetaAssetResolver]: Page discovery returned incomplete/rate-limited results. Trusting explicitly requested Page ID "${cleanRequestedId}"`);
        return {
          valid: true,
          pageId: cleanRequestedId,
          pageName: `Page_${cleanRequestedId}`,
          status: "TRUSTED_EXPLICIT_PAGE",
          source: "USER_PROVIDED_FALLBACK",
          blocked: false,
          isAccessible: true,
          isAuthorized: true,
        };
      }

      const result = {
        valid: false,
        pageId: cleanRequestedId,
        pageName: null,
        status: "PAGE_ACCOUNT_MISMATCH",
        blocked: true,
        isAccessible: false,
        isAuthorized: false,
        requiredAction: `Facebook Page ID "${cleanRequestedId}" specified in spreadsheet is not associated with or accessible by selected Ad Account ${cleanId}. Please update the spreadsheet with an authorized Page ID or grant access in Meta Business Manager.`,
        error: `Page Account Mismatch: Facebook Page ID "${cleanRequestedId}" does not belong to or have Ads authorization with selected Ad Account ${cleanId}.`,
      };
      this.logPageDiagnostic({
        selectedAccountId: cleanId,
        sheetPageId: cleanRequestedId,
        resolvedPageId: null,
        isAccessible: false,
        isAuthorized: false,
        failureStep: "PAGE_VALIDATION",
        status: "PAGE_ACCOUNT_MISMATCH",
        details: result.error,
      });
      return result;
    }

    // Priority 2: No Page ID requested in row -> Discover on account
    if (authorizedPages.length > 0) {
      const selectedPage = authorizedPages.find((p) => p.source === "AD_ACCOUNT_PROMOTE_PAGE") || authorizedPages[0];
      const result = {
        valid: true,
        pageId: selectedPage.id,
        pageName: selectedPage.name,
        status: "DISCOVERED_SINGLE_ACCOUNT_ASSET",
        source: selectedPage.source,
        blocked: false,
        isAccessible: true,
        isAuthorized: true,
        message: `Dynamically resolved verified Facebook Page "${selectedPage.name}" [${selectedPage.id}] for Ad Account ${cleanId}.`,
      };
      this.logPageDiagnostic({
        selectedAccountId: cleanId,
        sheetPageId: null,
        resolvedPageId: selectedPage.id,
        isAccessible: true,
        isAuthorized: true,
        failureStep: "PAGE_VALIDATION",
        status: "DISCOVERED_SINGLE_ACCOUNT_ASSET",
        details: result.message,
      });
      return result;
    }

    // Priority 5: No authorized Page found anywhere for this account
    const result = {
      valid: false,
      pageId: null,
      pageName: null,
      status: "PAGE_PERMISSION_MISSING",
      blocked: true,
      isAccessible: false,
      isAuthorized: false,
      requiredAction: `Ad Account ${cleanId} has no associated Facebook Pages with advertising permissions. A Facebook Page is strictly required by Meta to run ads. Please create or link a Page in Meta Business Manager.`,
      error: `Missing required Facebook Page: No Facebook Page with Ads permission is associated with Ad Account ${cleanId}.`,
    };
    this.logPageDiagnostic({
      selectedAccountId: cleanId,
      sheetPageId: null,
      resolvedPageId: null,
      isAccessible: false,
      isAuthorized: false,
      failureStep: "PAGE_VALIDATION",
      status: "PAGE_PERMISSION_MISSING",
      details: result.error,
    });
    return result;
  }

  /**
   * Verify and dynamically resolve Pixel asset for the selected ad account
   */
  static async verifyAndResolvePixelAsset({ accountId, accessToken, requestedPixelId, objective, allowFallbackPixel = false, getAccountPixelsFn, getUserAdAccountsFn }) {
    const cleanId = accountId ? (String(accountId).startsWith("act_") ? accountId : `act_${accountId}`) : null;
    const objUpper = String(objective || "").toUpperCase();
    const isPixelRequired = ["OUTCOME_SALES", "SALES", "CONVERSIONS", "OFFSITE_CONVERSIONS"].includes(objUpper);

    const getPixels = getAccountPixelsFn || (async (acc) => {
      const url = `${META_GRAPH_URL}/${acc}/adspixels`;
      const res = await axios.get(url, { params: { access_token: accessToken, fields: "id,name,is_unavailable" } }).catch(() => ({ data: {} }));
      return res.data?.data || [];
    });

    const getUserAccounts = getUserAdAccountsFn || (async () => {
      const url = `${META_GRAPH_URL}/me/adaccounts`;
      const res = await axios.get(url, { params: { access_token: accessToken, fields: "id,name,account_id" } }).catch(() => ({ data: {} }));
      return res.data?.data || [];
    });

    if (requestedPixelId && String(requestedPixelId).trim()) {
      const cleanPixelId = String(requestedPixelId).trim();
      if (cleanId) {
        const accountPixels = await getPixels(cleanId);
        const isAssociated = accountPixels.some((p) => String(p.id) === cleanPixelId);
        if (isAssociated) {
          return {
            valid: true,
            pixelId: cleanPixelId,
            status: "VERIFIED",
            source: "SELECTED_ACCOUNT",
            blocked: false,
            message: `Pixel ${cleanPixelId} is verified and authorized on account ${cleanId}.`,
          };
        }
      }

      // Check other accounts
      try {
        const userAccounts = await getUserAccounts();
        for (const otherAcc of userAccounts) {
          const otherId = String(otherAcc.id || otherAcc.account_id);
          const cleanOtherId = otherId.startsWith("act_") ? otherId : `act_${otherId}`;
          if (cleanOtherId === cleanId) continue;

          const otherPixels = await getPixels(cleanOtherId);
          const match = otherPixels.find((p) => String(p.id) === cleanPixelId);
          if (match) {
            return {
              valid: false,
              pixelId: cleanPixelId,
              status: "CROSS_ACCOUNT_PERMISSION_REQUIRED",
              blocked: isPixelRequired,
              owningAccount: { id: cleanOtherId, name: otherAcc.name },
              requiredAction: `Pixel ${cleanPixelId} belongs to accessible account ${otherAcc.name || cleanOtherId} (${cleanOtherId}), but is not shared with selected account ${cleanId}. In Meta Business Manager, go to Business Settings -> Data Sources -> Pixels, select Pixel ${cleanPixelId}, click "Connected Assets", and add Ad Account ${cleanId}.`,
              error: `Cross-account asset sharing required: Pixel ${cleanPixelId} belongs to ${otherAcc.name || cleanOtherId} and must be shared with ${cleanId}.`,
            };
          }
        }
      } catch (err) {
        // ignore inspection failure
      }

      if (allowFallbackPixel && cleanId) {
        const accountPixels = await getPixels(cleanId);
        if (accountPixels && accountPixels.length === 1) {
          const singlePix = accountPixels[0];
          console.log(`ℹ️ [Meta Pixel Auto-Resolution Notice]: Dynamic fallback selected: Using verified account pixel "${singlePix.id}" (${singlePix.name || "Pixel"}) instead of requested pixel "${cleanPixelId}".`);
          return {
            valid: true,
            pixelId: String(singlePix.id),
            status: "FALLBACK_PIXEL_SELECTED",
            source: "SELECTED_ACCOUNT_FALLBACK",
            blocked: false,
            originalRequestedPixelId: cleanPixelId,
            message: `Fallback Pixel selected: Using verified account pixel "${singlePix.id}" (${singlePix.name || "Pixel"}) instead of requested pixel "${cleanPixelId}".`,
          };
        }
      }

      // If campaign configuration does NOT require a Pixel (e.g. Traffic, Awareness, Engagement)
      if (!isPixelRequired) {
        return {
          valid: true,
          pixelId: null,
          status: "TRACKING_OPTIONAL",
          blocked: false,
          warning: `Pixel ${cleanPixelId} is not accessible or valid on account ${cleanId}, but was safely omitted because tracking is optional for objective ${objUpper || "standard"}.`,
          message: `Tracking pixel is optional for objective ${objUpper || "standard"} and was omitted.`,
        };
      }

      // 4. Query Meta Graph API directly to distinguish Incorrect ID vs Missing Permissions vs External Business
      let directMetaCheck = null;
      if (accessToken) {
        try {
          const directRes = await axios.get(`${META_GRAPH_URL}/${cleanPixelId}`, {
            params: {
              access_token: accessToken,
              fields: "id,name",
            },
            timeout: 10000,
          });
          directMetaCheck = { success: true, data: directRes.data };
        } catch (directErr) {
          const errCode = directErr.response?.data?.error?.code;
          const errSubcode = directErr.response?.data?.error?.error_subcode;
          const errMsg = directErr.response?.data?.error?.message || directErr.message;
          directMetaCheck = {
            success: false,
            code: errCode,
            subcode: errSubcode,
            message: errMsg,
          };
        }
      }

      // 4A: Object does not exist on Meta Graph API -> INCORRECT_ID
      if (
        directMetaCheck &&
        !directMetaCheck.success &&
        (directMetaCheck.code === 100 && (directMetaCheck.subcode === 33 || /does not exist|cannot be loaded/i.test(directMetaCheck.message)))
      ) {
        return {
          valid: false,
          pixelId: cleanPixelId,
          status: "INVALID_PIXEL_ID",
          blocked: true,
          error: `Incorrect Pixel ID: Pixel ${cleanPixelId} does not exist on Meta Graph API (Meta Error 100/Subcode 33: Object does not exist).`,
          requiredAction: `Pixel ${cleanPixelId} does not exist on Meta. Verify the spreadsheet cell for typos or inadvertent spreadsheet drag/auto-fill series increments, and ensure the ID matches an active Pixel in Meta Events Manager.`,
        };
      }

      // 4B: Pixel exists on Meta but authenticated user lacks permissions -> PIXEL_PERMISSION_MISSING
      if (
        directMetaCheck &&
        !directMetaCheck.success &&
        (directMetaCheck.code === 10 || directMetaCheck.code === 200 || /permission/i.test(directMetaCheck.message))
      ) {
        return {
          valid: false,
          pixelId: cleanPixelId,
          status: "PIXEL_PERMISSION_MISSING",
          blocked: true,
          error: `Pixel Permission Missing: Pixel ${cleanPixelId} exists on Meta, but the authenticated user lacks permissions or Business Manager authorization to access it.`,
          requiredAction: `Grant the authenticated Meta user 'Manage Pixel' or 'Advertise' permissions for Pixel ${cleanPixelId} in Meta Business Manager.`,
        };
      }

      // 4C: Pixel exists on Meta but is not connected to this ad account -> PIXEL_NOT_SHARED_WITH_ACCOUNT
      if (directMetaCheck && directMetaCheck.success) {
        const pixData = directMetaCheck.data;
        const pixelDisplayName = pixData.name ? `"${pixData.name}" (${cleanPixelId})` : `Pixel ${cleanPixelId}`;
        return {
          valid: false,
          pixelId: cleanPixelId,
          status: "PIXEL_NOT_SHARED_WITH_ACCOUNT",
          blocked: true,
          error: `Pixel Not Connected to Ad Account: Pixel ${pixelDisplayName} exists and is accessible, but is not added as a Connected Asset to selected ad account ${cleanId}.`,
          requiredAction: `In Meta Business Manager, go to Business Settings -> Data Sources -> Datasets (or Pixels) -> select ${pixelDisplayName} -> click the "Connected Assets" tab -> click "Add Assets" -> select Ad Account ${cleanId} and confirm.`,
        };
      }

      return {
        valid: false,
        pixelId: cleanPixelId,
        status: isPixelRequired ? "PIXEL_NOT_AVAILABLE" : "ASSET_UNAVAILABLE",
        blocked: isPixelRequired,
        requiredAction: `Pixel ${cleanPixelId} was not found on selected account ${cleanId} or any accessible accounts for this user. Verify that the Pixel ID is correct in Meta Events Manager.`,
        error: `Pixel ${cleanPixelId} is inaccessible or does not exist for the authenticated user (PIXEL_NOT_AVAILABLE).`,
      };
    }

    if (!isPixelRequired) {
      return {
        valid: true,
        pixelId: null,
        status: "TRACKING_OPTIONAL",
        blocked: false,
        message: `Tracking pixel is optional for objective ${objUpper || "standard"} and was omitted.`,
      };
    }

    if (!cleanId) {
      return {
        valid: false,
        pixelId: null,
        status: "PIXEL_NOT_AVAILABLE",
        blocked: true,
        requiredAction: `A Pixel ID is required for campaign objective ${objUpper}, but no ad account was selected.`,
        error: `Missing required Pixel ID and ad account for objective ${objUpper} (PIXEL_NOT_AVAILABLE).`,
      };
    }

    const accountPixels = await getPixels(cleanId);
    if (!accountPixels || accountPixels.length === 0) {
      return {
        valid: false,
        pixelId: null,
        status: "PIXEL_NOT_AVAILABLE",
        blocked: true,
        requiredAction: `Campaign objective (${objUpper}) requires a conversion tracking Pixel, but no Pixel ID was supplied in the spreadsheet row and selected ad account ${cleanId} has no associated pixels.`,
        error: `Missing required conversion Pixel for objective ${objUpper} on account ${cleanId} (PIXEL_NOT_AVAILABLE).`,
      };
    }

    if (accountPixels.length > 1) {
      return {
        valid: false,
        pixelId: null,
        status: "AMBIGUOUS_ASSET",
        clarificationNeeded: true,
        blocked: true,
        availableAssets: accountPixels.map((p) => ({ id: p.id, name: p.name })),
        requiredAction: `Multiple eligible Pixels were found on account ${cleanId} (${accountPixels.map((p) => `${p.name || "Pixel"} [${p.id}]`).join(", ")}). Clarification required: please specify the intended Pixel ID in the spreadsheet row.`,
        error: `Ambiguous Pixel selection: Multiple pixels available on account ${cleanId}.`,
      };
    }

    return {
      valid: true,
      pixelId: accountPixels[0].id,
      status: "DISCOVERED_SINGLE_ACCOUNT_ASSET",
      blocked: false,
      message: `Dynamically resolved verified single pixel ${accountPixels[0].id} (${accountPixels[0].name || "Pixel"}) from account ${cleanId}.`,
    };
  }

  /**
   * Verify and dynamically resolve App asset for the selected ad account
   */
  static async verifyAndResolveAppAsset({ accountId, accessToken, requestedAppId, objective, getAccountAppsFn, getUserAdAccountsFn }) {
    const cleanId = accountId ? (String(accountId).startsWith("act_") ? accountId : `act_${accountId}`) : null;
    const objUpper = String(objective || "").toUpperCase();
    const isAppRequired = ["APP_INSTALLS", "OUTCOME_APP_PROMOTION"].includes(objUpper);

    const getApps = getAccountAppsFn || (async (acc) => {
      const apps = [];
      try {
        const advRes = await axios.get(`${META_GRAPH_URL}/${acc}/advertisable_applications`, {
          params: { access_token: accessToken, fields: "id,name,object_store_urls" },
        }).catch(() => ({ data: {} }));
        if (Array.isArray(advRes.data?.data)) {
          apps.push(...advRes.data.data);
        }
      } catch (e) {}

      try {
        const url = `${META_GRAPH_URL}/${acc}/applications`;
        const res = await axios.get(url, { params: { access_token: accessToken, fields: "id,name" } }).catch(() => ({ data: {} }));
        if (Array.isArray(res.data?.data)) {
          for (const item of res.data.data) {
            if (!apps.some((a) => String(a.id) === String(item.id))) {
              apps.push(item);
            }
          }
        }
      } catch (e) {}

      return apps;
    });

    const getUserAccounts = getUserAdAccountsFn || (async () => {
      const url = `${META_GRAPH_URL}/me/adaccounts`;
      const res = await axios.get(url, { params: { access_token: accessToken, fields: "id,name,account_id" } }).catch(() => ({ data: {} }));
      return res.data?.data || [];
    });

    if (requestedAppId && String(requestedAppId).trim()) {
      const cleanAppId = String(requestedAppId).trim();
      if (cleanId) {
        const accountApps = await getApps(cleanId);
        const isAssociated = accountApps.some((a) => String(a.id) === cleanAppId);
        if (isAssociated) {
          return {
            valid: true,
            appId: cleanAppId,
            status: "VERIFIED",
            source: "SELECTED_ACCOUNT",
            blocked: false,
            message: `App ${cleanAppId} is verified and authorized on account ${cleanId}.`,
          };
        }
      }

      // Check other accounts
      try {
        const userAccounts = await getUserAccounts();
        for (const otherAcc of userAccounts) {
          const otherId = String(otherAcc.id || otherAcc.account_id);
          const cleanOtherId = otherId.startsWith("act_") ? otherId : `act_${otherId}`;
          if (cleanOtherId === cleanId) continue;

          const otherApps = await getApps(cleanOtherId);
          const match = otherApps.find((a) => String(a.id) === cleanAppId);
          if (match) {
            if (!isAppRequired) {
              return {
                valid: true,
                appId: null,
                status: "APP_OMITTED_OPTIONAL",
                blocked: false,
                warning: `App ${cleanAppId} belongs to account ${otherAcc.name || cleanOtherId} (${cleanOtherId}) and is not linked to selected account ${cleanId}. Because objective ${objUpper || "standard"} does not require an App ID, it was cleanly omitted from the ad set tracking.`,
              };
            }
            return {
              valid: false,
              appId: cleanAppId,
              status: "CROSS_ACCOUNT_PERMISSION_REQUIRED",
              blocked: true,
              owningAccount: { id: cleanOtherId, name: otherAcc.name },
              requiredAction: `App ${cleanAppId} is associated with authorized account ${otherAcc.name || cleanOtherId} (${cleanOtherId}), but is not linked to selected account ${cleanId}. In Meta Business Manager, link App ${cleanAppId} to Ad Account ${cleanId}.`,
              error: `Cross-account asset sharing required: App ${cleanAppId} belongs to ${otherAcc.name || cleanOtherId} and must be shared with ${cleanId}.`,
            };
          }
        }
      } catch (err) {
        // ignore inspection failure
      }

      if (!isAppRequired) {
        return {
          valid: true,
          appId: null,
          status: "APP_OMITTED_OPTIONAL",
          blocked: false,
          warning: `App ID ${cleanAppId} is not linked to account ${cleanId} and campaign objective ${objUpper || "standard"} does not require an App ID; omitted from ad tracking.`,
        };
      }

      return {
        valid: false,
        appId: cleanAppId,
        status: isAppRequired ? "APP_NOT_AVAILABLE" : "ASSET_UNAVAILABLE",
        blocked: isAppRequired,
        requiredAction: `App ${cleanAppId} was not found on selected account ${cleanId} or any accessible accounts for this user. Verify that the App ID is correct in Meta App Dashboard / Business Manager.`,
        error: `App ${cleanAppId} is inaccessible or does not exist for the authenticated user (APP_NOT_AVAILABLE).`,
      };
    }

    if (!isAppRequired) {
      return {
        valid: true,
        appId: null,
        status: "APP_OPTIONAL",
        blocked: false,
        message: `App ID is optional for objective ${objUpper || "standard"} and was omitted.`,
      };
    }

    if (!cleanId) {
      return {
        valid: false,
        appId: null,
        status: "APP_NOT_AVAILABLE",
        blocked: true,
        requiredAction: `An App ID is required for objective ${objUpper}, but no ad account was selected.`,
        error: `Missing required App ID and ad account for objective ${objUpper} (APP_NOT_AVAILABLE).`,
      };
    }

    const accountApps = await getApps(cleanId);
    if (!accountApps || accountApps.length === 0) {
      return {
        valid: false,
        appId: null,
        status: "APP_NOT_AVAILABLE",
        blocked: true,
        requiredAction: `Campaign objective (${objUpper}) requires an Application ID, but no App ID was specified in the spreadsheet row and account ${cleanId} has no linked apps.`,
        error: `Missing required App ID for objective ${objUpper} on account ${cleanId} (APP_NOT_AVAILABLE).`,
      };
    }

    if (accountApps.length > 1) {
      return {
        valid: false,
        appId: null,
        status: "AMBIGUOUS_ASSET",
        clarificationNeeded: true,
        blocked: true,
        availableAssets: accountApps.map((a) => ({ id: a.id, name: a.name })),
        requiredAction: `Multiple eligible Apps found on account ${cleanId} (${accountApps.map((a) => `${a.name || "App"} [${a.id}]`).join(", ")}). Specify the desired App ID in the spreadsheet row.`,
        error: `Ambiguous App selection on account ${cleanId}.`,
      };
    }

    return {
      valid: true,
      appId: accountApps[0].id,
      status: "DISCOVERED_SINGLE_ACCOUNT_ASSET",
      blocked: false,
      message: `Dynamically resolved verified single app ${accountApps[0].id} from account ${cleanId}.`,
    };
  }

  /**
   * Verify and dynamically resolve an Instagram User ID
   */
  static async verifyAndResolveInstagramAsset({ accountId, accessToken, pageId, requestedIgId }) {
    if (!requestedIgId || !String(requestedIgId).trim()) {
      return {
        valid: true,
        instagramActorId: null,
        status: "INSTAGRAM_OPTIONAL",
        blocked: false,
      };
    }

    let clean = String(requestedIgId).trim().replace(/^@/, "");
    if (/^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/.test(clean)) {
      try {
        clean = BigInt(Math.round(Number(clean))).toString();
      } catch (e) {
        clean = Number(clean).toLocaleString("fullwide", { useGrouping: false });
      }
    }
    clean = clean.replace(/\.0+$/, "").replace(/[^0-9]/g, "");

    if (!clean || !/^\d{5,}$/.test(clean)) {
      return {
        valid: true,
        instagramActorId: null,
        status: "INSTAGRAM_OMITTED_INVALID_FORMAT",
        blocked: false,
        warning: `Instagram ID "${requestedIgId}" is not a valid numeric identifier; omitted from creative.`,
      };
    }

    try {
      const cleanAccId = accountId ? (String(accountId).startsWith("act_") ? accountId : `act_${accountId}`) : null;
      if (cleanAccId && accessToken) {
        const accIgRes = await axios.get(`${META_GRAPH_URL}/${cleanAccId}/instagram_accounts`, {
          params: { access_token: accessToken, fields: "id,username" },
        }).catch(() => ({ data: {} }));
        const accIgs = accIgRes.data?.data || [];
        const match = accIgs.find((ig) => String(ig.id) === clean);
        if (match) {
          return {
            valid: true,
            instagramActorId: clean,
            status: "VERIFIED",
            source: "AD_ACCOUNT_LINKED_INSTAGRAM",
            blocked: false,
          };
        }
      }

      if (pageId && accessToken) {
        const pageIgRes = await axios.get(`${META_GRAPH_URL}/${pageId}`, {
          params: { access_token: accessToken, fields: "instagram_business_account,connected_instagram_account" },
        }).catch(() => ({ data: {} }));
        const linkedId = pageIgRes.data?.instagram_business_account?.id || pageIgRes.data?.connected_instagram_account?.id;
        if (linkedId && String(linkedId) === clean) {
          return {
            valid: true,
            instagramActorId: clean,
            status: "VERIFIED",
            source: "PAGE_LINKED_INSTAGRAM",
            blocked: false,
          };
        }
      }
    } catch (e) {
      // ignore
    }

    // Optional by default for Facebook feed ads: omit cleanly if not linked
    return {
      valid: true,
      instagramActorId: null,
      status: "INSTAGRAM_OMITTED_OPTIONAL",
      blocked: false,
      warning: `Instagram account ${clean} is not linked to Ad Account or Page; omitted from creative to prevent API rejection.`,
    };
  }

  /**
   * Unified Resolver: Resolves all account and row assets in a single canonical call
   */
  static async resolveAllRowAssets({ accountId, accessToken, rowData = {}, objective = "OUTCOME_SALES" }) {
    const [pageRes, pixelRes, appRes, igRes] = await Promise.all([
      this.verifyAndResolvePageAsset({
        accountId,
        accessToken,
        requestedPageId: rowData.pageId,
      }),
      this.verifyAndResolvePixelAsset({
        accountId,
        accessToken,
        requestedPixelId: rowData.pixelId,
        objective,
      }),
      this.verifyAndResolveAppAsset({
        accountId,
        accessToken,
        requestedAppId: rowData.appId,
        objective,
      }),
      this.verifyAndResolveInstagramAsset({
        accountId,
        accessToken,
        pageId: rowData.pageId,
        requestedIgId: rowData.instagramId,
      }),
    ]);

    const isBlocked = Boolean(pageRes.blocked || pixelRes.blocked || appRes.blocked || igRes.blocked);
    const blockReason = pageRes.blocked
      ? pageRes.error
      : pixelRes.blocked
      ? pixelRes.error
      : appRes.blocked
      ? appRes.error
      : igRes.blocked
      ? igRes.error
      : null;

    return {
      page: pageRes,
      pixel: pixelRes,
      app: appRes,
      instagram: igRes,
      isBlocked,
      blockReason,
    };
  }
}

export default MetaAssetResolver;
