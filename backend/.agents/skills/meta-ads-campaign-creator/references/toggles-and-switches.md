# Meta Ads Toggles & Switches Reference Guide

This document lists all configuration toggles across Campaign, Ad Set, and Ad levels for Meta Advertising with their allowed Excel/Google Sheet values and default behavior.

---

## 🎛️ Toggles & Switches Matrix

| Level | Toggle / Switch | Excel / Sheet Value | Default State | Description & Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Campaign** | `Campaign Is Using L3 Schedule` | `TRUE` / `FALSE` | `FALSE` | When `TRUE`, enables advanced 3rd-level time-of-day and day-of-week delivery scheduling. |
| **Campaign** | `Is Budget Scheduling Enabled For Campaign` | `TRUE` / `FALSE` | `FALSE` | When `TRUE`, automatically increases or decreases campaign budgets during promotional peaks. |
| **Ad Set** | `Use Accelerated Delivery` | `TRUE` / `FALSE` | `FALSE` | Spends budget as fast as possible (only supported with bid caps). |
| **Ad Set** | `Is Budget Scheduling Enabled For Ad Set` | `TRUE` / `FALSE` | `FALSE` | Applies specific ad set-level budget pacing rules. |
| **Ad Set** | `Advantage Audience` | `TRUE` / `FALSE` | `FALSE / Auto` | Meta AI dynamically broadens audience targeting beyond defined parameters. |
| **Ad Set** | `Targeting Optimization` | `TRUE` / `FALSE` or enum | `Auto` | Expands detailed targeting (interests & behaviors) when cost-efficient. |
| **Ad Set** | `Targeting Relaxation` | `TRUE` / `FALSE` or enum | `Auto` | Relaxes demographic limits (age/gender) if conversions are found elsewhere. |
| **Ad** | `Optimize text per person` | `TRUE` / `FALSE` | `TRUE` | Swaps headline and primary text order depending on user engagement probability. |
| **Ad** | `Optimized Ad Creative` | `TRUE` / `FALSE` | `TRUE / Auto` | Enables Meta Advantage+ Creative automated brightness, contrast, and layout enhancements. |
| **Ad** | `Website Events Tracking` | `TRUE` / `FALSE` | `TRUE` | Automatically links the connected Pixel dataset (e.g. Sales Pixel) to the Ad via `tracking_specs`. |
| **Ad** | `App Events Tracking` | `TRUE` / `FALSE` | `FALSE` | Enables tracking for mobile app installs and in-app events when an App ID is connected. |
| **Ad** | `Force Single Link` | `TRUE` / `FALSE` | `FALSE` | Forces destination traffic to a single static URL instead of dynamic catalog links. |
| **Ad** | `Dynamic Ad Voice` | `TRUE` / `FALSE` or enum | `Auto` | Automatically generates or enhances video audio and voiceover tracks. |
| **Ad** | `Creative Optimization` | `TRUE` / `FALSE` or enum | `Auto` | Automatically selects top-performing combinations of media, copy, and badges. |
| **Ad** | `Add End Card` | `TRUE` / `FALSE` | `FALSE` | Displays an interactive branded card at the end of video ads. |
| **Ad** | `Use Page as Actor` | `TRUE` / `FALSE` | `TRUE / Auto` | Assigns the connected Facebook Page as the primary ad sponsor identity. |

---

## 🔄 Resolution Rule for Toggles

```text
1. Check User Prompt: Did user explicitly state "turn on Advantage Audience" or "enable text optimization"?
   └── YES -> Set Toggle to TRUE
   └── NO  -> Proceed to Step 2

2. Check Google Sheet / Excel Data Warehouse:
   └── Value in Sheet is TRUE/FALSE -> Use Sheet Value
   └── Value missing / empty in Sheet -> Use Default Value
```
