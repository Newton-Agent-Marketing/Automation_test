# Google Sheets / Excel AI Context Warehouse Integration

This guide details how the AI Agent automatically resolves campaign, ad set, and ad fields from the **AI Context Data Warehouse** (Google Sheet / Excel connector).

---

## 📥 How Fallback Resolution Works

```text
User Request: "Create a Meta Ad campaign for Summer Shoes with budget ₹1000/day"
                         │
                         ▼
             [Extract User Input]
   - Campaign Name: "Summer Shoes"
   - Daily Budget: 1000
   - Objective: Not provided in prompt!
   - Audience: Not provided in prompt!
   - Link / CTA: Not provided in prompt!
                         │
                         ▼
        [Query AI Context Data Warehouse]
  (Checks connected Google Sheet / Excel Table)
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
[Field Found in Sheet]           [Field Missing in Sheet]
- Objective: OUTCOME_SALES        - Special Categories: Default NONE
- Countries: ["IN"]               - Toggles: Use Default Matrix
- CTA: SHOP_NOW
- Link: https://example.com/shoes
```

---

## 📑 Expected Sheet Column Mapping

When reading from the AI Context Google Sheet / Excel table, columns are matched to the standard schema:

| Column Name in Sheet | Level | Target Parameter in Tool | Default if Missing |
| :--- | :--- | :--- | :--- |
| `Campaign Name` | Campaign | `name` | Derived from brief |
| `Campaign Objective` | Campaign | `objective` | `OUTCOME_SALES` |
| `Campaign Daily Budget` | Campaign | `dailyBudget` | `500` |
| `Campaign Status` | Campaign | `status` | `PAUSED` |
| `Ad Set Name` | Ad Set | `name` | `Ad Set - <Geo/Audience>` |
| `Countries` | Ad Set | `targeting.countries` | `["IN"]` |
| `Age Min` / `Age Max` | Ad Set | `targeting.ageMin` / `ageMax` | `18` / `65` |
| `Optimization Goal` | Ad Set | `optimizationGoal` | `OFFSITE_CONVERSIONS` |
| `Ad Name` | Ad | `name` | `Ad Creative 01` |
| `Title` / `Headline` | Ad | `headline` | Generated from product |
| `Body` / `Primary Text` | Ad | `primaryText` | Generated from brief |
| `Call to Action` | Ad | `callToAction` | `SHOP_NOW` |
| `Call to Action Link` | Ad | `linkUrl` | Primary website URL |
| `URL Tags` | Ad | `urlTags` | Auto-generated UTMs |
