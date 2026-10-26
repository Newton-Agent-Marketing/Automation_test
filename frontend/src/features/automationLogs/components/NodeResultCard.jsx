import React, { useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Zap,
  Calendar,
  Send,
  Sliders,
} from "lucide-react";
import { formatNormalText } from "../utils/formatLogContent";

export const NodeResultCard = ({ node, executionId, onOpenDetail }) => {
  const [showFullOutput, setShowFullOutput] = useState(false);
  const [showFullInput, setShowFullInput] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);

  const status = node.status || "pending";
  const duration = node.durationMs ? `${(node.durationMs / 1000).toFixed(2)}s` : "0s";

  const copyToClipboard = (e, text, key) => {
    e.stopPropagation();
    const str = formatNormalText(text);
    navigator.clipboard.writeText(str);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const getNodeIcon = () => {
    switch (node.nodeType) {
      case "trigger":
        return <Zap size={15} color="#8B5CF6" />;
      case "date":
        return <Calendar size={15} color="#2563EB" />;
      case "time":
        return <Clock size={15} color="#D97706" />;
      case "action":
        return <Send size={15} color="#059669" />;
      default:
        return <Sliders size={15} color="#0081FB" />;
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case "completed":
        return <CheckCircle2 size={16} color="#10B981" />;
      case "running":
        return <Loader2 size={16} color="#0081FB" className="animate-spin" />;
      case "failed":
        return <AlertCircle size={16} color="#EF4444" />;
      case "skipped":
      case "pending":
      default:
        return <Clock size={15} color="#64748B" />;
    }
  };

  const outputString = formatNormalText(node.output);
  const inputString = formatNormalText(node.input);
  const errorString = formatNormalText(node.error);
  const isLongOutput = outputString.length > 220 || outputString.split("\n").length > 6;
  const isLongInput = inputString.length > 220 || inputString.split("\n").length > 6;

  return (
    <div className={`al-node-card node-${status}`}>
      {/* Node Card Header */}
      <div className="al-node-header">
        <div className="al-node-title-group">
          <div className="al-node-index-badge">
            {node.executionOrder || 1}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            {getNodeIcon()}
            <span className="al-node-name">
              {node.nodeName || `${node.nodeType} Node`}
            </span>
            <span className="al-node-type-tag">{node.nodeType}</span>
          </div>
        </div>

        <div className="al-node-header-right">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {getStatusIcon()}
            <span
              className={`al-badge badge-${status}`}
              style={{ fontSize: 11, padding: "2px 8px" }}
            >
              {status}
            </span>
          </div>

          <div className="al-node-duration">
            <Clock size={12} />
            <span>{duration}</span>
          </div>

          <button
            type="button"
            className="al-copy-btn"
            onClick={() => onOpenDetail(node)}
            title="Inspect node details"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* Input / Output Content Sections */}
      <div className="al-node-sections">
        {/* Input Block */}
        {node.input && (
          <div className="al-content-block">
            <div className="al-content-header">
              <span>Input / Instruction</span>
              <button
                type="button"
                className="al-copy-btn"
                onClick={(e) => copyToClipboard(e, node.input, "input")}
              >
                {copiedKey === "input" ? <Check size={11} color="#10B981" /> : <Copy size={11} />}
                {copiedKey === "input" ? "Copied" : "Copy"}
              </button>
            </div>
            <div className={`al-content-body ${showFullInput ? "is-expanded" : ""}`}>
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13, lineHeight: 1.6, color: "#000000", fontWeight: 500 }}>
                {inputString}
              </div>
            </div>
            {isLongInput && (
              <div className="al-show-more-bar">
                <button
                  type="button"
                  className="al-show-more-btn"
                  onClick={() => setShowFullInput(!showFullInput)}
                >
                  {showFullInput ? (
                    <>
                      <ChevronUp size={12} /> Show Less
                    </>
                  ) : (
                    <>
                      <ChevronDown size={12} /> Show More
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Output Block */}
        {node.output && (
          <div className="al-content-block">
            <div className="al-content-header">
              <span>Output / Result</span>
              <button
                type="button"
                className="al-copy-btn"
                onClick={(e) => copyToClipboard(e, node.output, "output")}
              >
                {copiedKey === "output" ? <Check size={11} color="#10B981" /> : <Copy size={11} />}
                {copiedKey === "output" ? "Copied" : "Copy"}
              </button>
            </div>
            <div className={`al-content-body ${showFullOutput ? "is-expanded" : ""}`}>
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13, lineHeight: 1.6, color: "#000000", fontWeight: 500 }}>
                {outputString}
              </div>
            </div>
            {isLongOutput && (
              <div className="al-show-more-bar">
                <button
                  type="button"
                  className="al-show-more-btn"
                  onClick={() => setShowFullOutput(!showFullOutput)}
                >
                  {showFullOutput ? (
                    <>
                      <ChevronUp size={12} /> Show Less
                    </>
                  ) : (
                    <>
                      <ChevronDown size={12} /> Show More
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Error Block if failed */}
        {node.error && (
          <div className="al-content-block is-error">
            <div className="al-content-header" style={{ color: "#EF4444" }}>
              <span>Error Details</span>
              <button
                type="button"
                className="al-copy-btn"
                onClick={(e) => copyToClipboard(e, node.error, "error")}
              >
                {copiedKey === "error" ? <Check size={11} color="#10B981" /> : <Copy size={11} />}
                {copiedKey === "error" ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="al-content-body" style={{ color: "#FCA5A5" }}>
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13, lineHeight: 1.6 }}>
                {errorString}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NodeResultCard;
