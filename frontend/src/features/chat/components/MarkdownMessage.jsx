import React, { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, FileDown, ExternalLink, Code2 } from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

function sanitizeMarkdownText(text) {
  if (!text || typeof text !== "string") return text || "";
  let str = text;
  // Mask Meta / Google OAuth tokens & secrets
  str = str.replace(/EAA[A-Za-z0-9]+/g, "[REDACTED_TOKEN]");
  str = str.replace(/bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED_TOKEN]");
  str = str.replace(/access_token=[^&"\s]+/gi, "access_token=[REDACTED_TOKEN]");
  str = str.replace(/app_secret=[^&"\s]+/gi, "app_secret=[REDACTED_SECRET]");
  str = str.replace(/"client_secret"\s*:\s*"[^"]+"/gi, '"client_secret":"[REDACTED_SECRET]"');
  // Strip out the green "All Fields Validated" callout as requested
  str = str.replace(/>\s*(?:✅|🟢|\[✓\])?\s*\*\*All Fields Validated\*\*:[^\n]*(\n|$)+/gi, "");
  return str;
}

export const MarkdownMessage = ({ content, role, id, toolCalls = [], tokenUsage = null }) => {
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [copiedCodeIndex, setCopiedCodeIndex] = useState(null);
  const contentRef = useRef(null);

  const cleanContent = sanitizeMarkdownText(content);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cleanContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed", err);
    }
  };

  const handleCopyCode = async (codeText, index) => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopiedCodeIndex(index);
      setTimeout(() => setCopiedCodeIndex(null), 2000);
    } catch (err) {
      console.error("Code copy failed", err);
    }
  };

  const handleExportPDF = async () => {
    if (!contentRef.current || exporting) return;
    try {
      setExporting(true);
      const canvas = await html2canvas(contentRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#FFFFFF",
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, "PNG", 10, 10, pdfWidth - 20, Math.min(pdfHeight, 277));
      pdf.save(`Newton-AI-Report-${id || Date.now()}.pdf`);
    } catch (error) {
      console.error("PDF export error:", error);
    } finally {
      setExporting(false);
    }
  };

  if (role === "user") {
    return (
      <div className="bubble-text user-bubble-content">
        {cleanContent}
      </div>
    );
  }

  let codeBlockCounter = 0;

  return (
    <div className="assistant-message-wrapper" ref={contentRef}>
      {Array.isArray(toolCalls) && toolCalls.length > 0 && (
        <div className="tool-execution-list">
          {toolCalls.map((t, idx) => {
            const isFailed = t.status === "FAILED" || t.status === "ERROR";
            return (
              <div
                key={`tool-exec-${idx}-${t.toolName || "tool"}`}
                className="tool-execution-banner"
              >
                <div className="tool-execution-left">
                  <div className="tool-execution-icon-box" title="Tool execution">
                    <img
                      src="/icons/tool-logo.png"
                      alt="Tool logo"
                      className="tool-execution-icon-img"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        if (e.currentTarget.nextSibling) {
                          e.currentTarget.nextSibling.style.display = "block";
                        }
                      }}
                    />
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      style={{ display: "none" }}
                    >
                      <rect x="3.5" y="3.5" width="7" height="7" rx="2" stroke="#FFFFFF" strokeWidth="2.2" />
                      <rect x="13.5" y="13.5" width="7" height="7" rx="2" stroke="#FFFFFF" strokeWidth="2.2" />
                      <path d="M7 10.5v3.5a2.5 2.5 0 0 0 2.5 2.5h4" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="tool-execution-details">
                    <div className="tool-execution-name">{t.toolName || "Tool execution"}</div>
                    <div className="tool-execution-sub">Tool execution</div>
                  </div>
                </div>

                <div className={`tool-execution-badge ${isFailed ? "failed" : "success"}`}>
                  {isFailed ? (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                      <span>Failed</span>
                    </>
                  ) : (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="16 9 10.5 14.5 8 12" />
                      </svg>
                      <span>Success</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="markdown-render-area">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ node, children, ...props }) => (
              <p className="rich-md-p" {...props}>
                {children}
              </p>
            ),
            a: ({ node, href, children, ...props }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="rich-md-link"
                style={{
                  color: "#3B82F6",
                  textDecoration: "underline",
                  fontWeight: 500,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "3px",
                }}
                {...props}
              >
                <span>{children}</span>
                <ExternalLink size={11} />
              </a>
            ),
            table: ({ node, ...props }) => (
              <div className="table-responsive-wrapper">
                <table className="rich-md-table" {...props} />
              </div>
            ),
            th: ({ node, ...props }) => <th className="rich-md-th" {...props} />,
            td: ({ node, ...props }) => <td className="rich-md-td" {...props} />,
            h1: ({ node, ...props }) => <h1 className="rich-md-h1" {...props} />,
            h2: ({ node, ...props }) => <h2 className="rich-md-h2" {...props} />,
            h3: ({ node, ...props }) => <h3 className="rich-md-h3" {...props} />,
            h4: ({ node, ...props }) => <h4 className="rich-md-h4" {...props} />,
            blockquote: ({ node, children, ...props }) => {
              let textContent = "";
              try {
                if (typeof children === "string") {
                  textContent = children;
                } else if (Array.isArray(children)) {
                  textContent = children
                    .map((c) => {
                      if (typeof c === "string") return c;
                      if (c?.props?.children) {
                        return Array.isArray(c.props.children)
                          ? c.props.children.join(" ")
                          : String(c.props.children);
                      }
                      return "";
                    })
                    .join(" ");
                } else if (children?.props?.children) {
                  textContent = String(children.props.children);
                }
              } catch (e) {
                textContent = "";
              }

              // Suppress green All Fields Validated alert callout completely as requested by user
              if (/All Fields Validated/i.test(textContent)) {
                return null;
              }

              const isErrorAlert =
                textContent.includes("🛑") ||
                textContent.includes("❌") ||
                textContent.includes("🚨") ||
                /issue alert|upload failed|error|failed/i.test(textContent);

              const isWarningAlert =
                textContent.includes("⚠️") ||
                textContent.includes("🟡") ||
                /warning|caution|skipped/i.test(textContent);

              const isSuccessAlert =
                textContent.includes("✅") ||
                textContent.includes("🟢") ||
                /success|confirmed/i.test(textContent);

              let quoteClass = "rich-md-quote";
              if (isErrorAlert) quoteClass += " quote-error";
              else if (isWarningAlert) quoteClass += " quote-warning";
              else if (isSuccessAlert) quoteClass += " quote-success";

              return <blockquote className={quoteClass} {...props}>{children}</blockquote>;
            },
            code: ({ node, inline, className, children, ...props }) => {
              const codeContent = String(children || "");
              const isInline = inline || (!className && !codeContent.includes("\n"));
              if (isInline) {
                return (
                  <code className="inline-code-pill" {...props}>
                    {children}
                  </code>
                );
              }

              const match = /language-(\w+)/.exec(className || "");
              const lang = match ? match[1] : "code";
              const codeString = codeContent.replace(/\n$/, "");
              const blockIndex = codeBlockCounter++;

              return (
                <div className="code-block-container" style={{ margin: "12px 0", borderRadius: "8px", overflow: "hidden", border: "1px solid rgba(51, 65, 85, 0.6)", backgroundColor: "#0F172A" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px", backgroundColor: "#1E293B", borderBottom: "1px solid rgba(51, 65, 85, 0.5)", fontSize: "11px", color: "#94A3B8" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600 }}>
                      <Code2 size={13} />
                      <span style={{ textTransform: "uppercase" }}>{lang}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyCode(codeString, blockIndex)}
                      style={{ background: "transparent", border: "none", color: "#CBD5E1", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontSize: "11px" }}
                    >
                      {copiedCodeIndex === blockIndex ? <Check size={12} color="#4ADE80" /> : <Copy size={12} />}
                      <span>{copiedCodeIndex === blockIndex ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                  <pre className="rich-code-pre" style={{ padding: "12px", margin: 0, overflowX: "auto", fontSize: "12px", color: "#F8FAFC", fontFamily: "monospace", lineHeight: 1.5 }}>
                    <code {...props}>{codeString}</code>
                  </pre>
                </div>
              );
            },
          }}
        >
          {cleanContent}
        </ReactMarkdown>
      </div>

      {/* Action Toolbar for AI responses */}
      <div className="message-action-bar">
        <button
          type="button"
          className="msg-action-btn"
          onClick={handleCopy}
          title="Copy response"
          aria-label="Copy response"
        >
          {copied ? <Check size={13} color="#16A34A" /> : <Copy size={13} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>

        <button
          type="button"
          className="msg-action-btn"
          onClick={handleExportPDF}
          disabled={exporting}
          title="Export as PDF Report"
          aria-label="Export as PDF"
        >
          <FileDown size={13} />
          <span>{exporting ? "Generating PDF..." : "Export PDF"}</span>
        </button>
      </div>
    </div>
  );
};

export default MarkdownMessage;
