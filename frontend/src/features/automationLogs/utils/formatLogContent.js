/**
 * Formats workflow execution input and output into human-readable normal text format
 * instead of raw JSON brackets, quotes, and keys.
 */
export const formatNormalText = (data) => {
  if (data === null || data === undefined) return "No data recorded";
  if (typeof data === "string") return data.trim();

  // If array of items
  if (Array.isArray(data)) {
    return data
      .map((item, idx) => {
        if (typeof item === "string") return `• ${item}`;
        if (item && typeof item === "object") {
          return `Item ${idx + 1}:\n${formatNormalText(item)}`;
        }
        return `• ${item}`;
      })
      .join("\n\n");
  }

  if (typeof data === "object") {
    // 1. If it's a standard AI agent / executor output object: { status, result, ... }
    if (data.result && typeof data.result === "string") {
      let output = data.result.trim();
      if (Array.isArray(data.toolCalls) && data.toolCalls.length > 0) {
        output += `\n\n[Tools Executed: ${data.toolCalls.length}]`;
      }
      return output;
    }

    if (data.message && typeof data.message === "string" && !data.task) {
      return data.message.trim();
    }

    if (data.content && typeof data.content === "string") {
      return data.content.trim();
    }

    // 2. If it's an input object: { task, config }
    if (data.task || data.instruction || data.prompt) {
      const mainText = (data.task || data.instruction || data.prompt || "").trim();
      const extraLines = [];

      if (data.config && typeof data.config === "object" && Object.keys(data.config).length > 0) {
        const configParts = [];
        for (const [key, val] of Object.entries(data.config)) {
          if (val !== null && val !== undefined && val !== "") {
            const formattedKey = key
              .replace(/([A-Z])/g, " $1")
              .replace(/_/g, " ")
              .replace(/^./, (str) => str.toUpperCase())
              .trim();
            configParts.push(`• ${formattedKey}: ${typeof val === "object" ? JSON.stringify(val) : val}`);
          }
        }
        if (configParts.length > 0) {
          extraLines.push(`Configuration:\n${configParts.join("\n")}`);
        }
      }

      if (extraLines.length > 0) {
        return `${mainText}\n\n${extraLines.join("\n\n")}`.trim();
      }
      return mainText;
    }

    // 3. For any other key-value object (e.g. error, config, metrics)
    const lines = [];
    for (const [key, val] of Object.entries(data)) {
      if (key === "status" && (val === "completed" || val === "running")) continue;
      if (val === null || val === undefined || val === "") continue;

      const label = key
        .replace(/([A-Z])/g, " $1")
        .replace(/_/g, " ")
        .replace(/^./, (str) => str.toUpperCase())
        .trim();

      if (typeof val === "object") {
        lines.push(`${label}:\n${formatNormalText(val)}`);
      } else {
        lines.push(`${label}: ${val}`);
      }
    }

    if (lines.length > 0) {
      return lines.join("\n");
    }
  }

  return String(data);
};

export default formatNormalText;
