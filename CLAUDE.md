# Newton AI — Meta Performance Goal & Conversion Location Architecture

## Overview
This architecture enforces **100% exact selection fidelity & ZERO dummy data** for Meta Marketing API v21.0 / ODAX optimization goals and destination types across the entire pipeline:
1. **Frontend `ad_channel` Node UI**: Drawer configuration with all 12 ODAX Performance Goals, auto-synced Conversion Locations, and conditional Pixel/App event pickers.
2. **Canvas Card**: Live pills displaying `{performance_goal_label} → {conversion_location}` and `{campaign_objective}`.
3. **AI Context Compiler (`buildAgentContextFromGraph`)**: Resolves nodes and edges into `ACTIVE_AI_CONTEXT_LAYER`, compiling `optimization_goal`, `billing_event`, `destination_type`, and exact `promoted_object` specs without dummy fallbacks.
4. **Execution Pipelines (Claude Agent SDK / Meta MCP & Campaign Preparation Service)**: Verbatim forwarding of `optimization_goal` and `destination_type` into Meta Ad Set creation API calls.

---

## 12 Meta ODAX Performance Goal Specifications

| Key | Label | Optimization Goal | Default Destination | Campaign Objective | Promoted Object Type |
|---|---|---|---|---|---|
| `WEBSITE_CONVERSIONS` | Maximize number of conversions (Website) | `OFFSITE_CONVERSIONS` | `WEBSITE` | `OUTCOME_SALES` | `PIXEL_EVENT` |
| `WEBSITE_CONVERSION_VALUE` | Maximize value of conversions (ROAS) | `VALUE` | `WEBSITE` | `OUTCOME_SALES` | `PIXEL_EVENT` |
| `LANDING_PAGE_VIEWS` | Maximize number of landing page views | `LANDING_PAGE_VIEWS` | `WEBSITE` | `OUTCOME_TRAFFIC` | `PAGE_ONLY` |
| `LINK_CLICKS` | Maximize number of link clicks | `LINK_CLICKS` | `WEBSITE` | `OUTCOME_TRAFFIC` | `PAGE_ONLY` |
| `APP_INSTALLS` | Maximize number of app installs | `APP_INSTALLS` | `APP` | `OUTCOME_APP_PROMOTION` | `APP_INSTALL` |
| `APP_EVENTS` | Maximize number of app events | `OFFSITE_CONVERSIONS` | `APP` | `OUTCOME_APP_PROMOTION` | `APP_EVENT` |
| `INSTANT_FORM_LEADS` | Maximize number of leads (Instant Forms) | `LEAD_GENERATION` | `ON_AD` | `OUTCOME_LEADS` | `PAGE_ONLY` |
| `WEBSITE_LEADS` | Maximize number of conversion leads (Website) | `OFFSITE_CONVERSIONS` | `WEBSITE` | `OUTCOME_LEADS` | `PIXEL_EVENT` |
| `MESSAGING_CONVERSATIONS` | Maximize number of conversations | `CONVERSATIONS` | `MESSAGING_APPS` | `OUTCOME_ENGAGEMENT` | `PAGE_ONLY` |
| `THRUPLAY_VIDEO_VIEWS` | Maximize ThruPlay video views | `THRUPLAY` | `ON_VIDEO` | `OUTCOME_ENGAGEMENT` | `PAGE_ONLY` |
| `REACH` | Maximize reach of ads | `REACH` | `UNDEFINED` | `OUTCOME_AWARENESS` | `PAGE_ONLY` |
| `IMPRESSIONS` | Maximize number of impressions | `IMPRESSIONS` | `UNDEFINED` | `OUTCOME_AWARENESS` | `PAGE_ONLY` |

---

## Promoted Object Routing Rules
- **Case A (`PIXEL_EVENT`)**: Requires connected Product node with `web_tracking_pixel_id`. Promoted object: `{ pixel_id, custom_event_type }`.
- **Case B (`APP_INSTALL`)**: Requires connected Product node with `mobile_app_id` and `app_store_url`. Promoted object: `{ application_id, object_store_url }`.
- **Case C (`APP_EVENT`)**: Requires `mobile_app_id`, `app_store_url`, and `custom_event_type`. Promoted object: `{ application_id, object_store_url, custom_event_type }`.
- **Case D (`PAGE_ONLY`)**: Requires Facebook `page_id`. Promoted object: `{ page_id }`. No pixel or app store URL is attached.
