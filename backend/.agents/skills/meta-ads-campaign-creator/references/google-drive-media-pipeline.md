# Google Drive Media Pipeline for Meta Ads Creative

This document details the retrieval, validation, and upload lifecycle of media assets referenced in the Excel Sheet via Google Drive links.

---

## 🔄 Media Processing Lifecycle

```mermaid
sequenceDiagram
    participant Excel as Excel Sheet (Warehouse)
    participant Agent as Claude Agent / Backend
    participant Drive as Google Drive API
    participant Meta as Meta Graph API
    participant DB as MongoDB Mapping

    Excel->>Agent: Row contains google_drive_video_url
    Agent->>Agent: Extract Drive File ID from URL
    Agent->>Drive: Check permissions & get file metadata
    alt File Inaccessible
        Drive-->>Agent: 403 / 404 Error
        Agent-->>Excel: Update status = FAILED (DRIVE_PERMISSION_REQUIRED)
    else File Valid
        Drive-->>Agent: File Stream (MIME: video/mp4, Size: 85MB)
        Agent->>Meta: POST /act_{account_id}/advideos (Upload Stream)
        Meta-->>Agent: video_id: 982347891234
        Agent->>DB: Save Mapping (row_id -> video_id)
        Agent->>Meta: Create Ad Creative with video_id
        Meta-->>Agent: ad_id: 120210000004
    end
```

---

## 📋 Media Validation Rules

Before uploading to Meta Marketing API:

1. **Format Compatibility**:
   - Videos: `video/mp4`, `video/quicktime` (.mov).
   - Images: `image/jpeg`, `image/png`.
2. **Size Limits**:
   - Video max file size: 4GB.
   - Image max file size: 30MB.
3. **Aspect Ratios**:
   - Feed: 1:1 or 4:5.
   - Stories & Reels: 9:16.
4. **Token Refresh**:
   - Transparently refresh OAuth access token if expired using the stored refresh token.
