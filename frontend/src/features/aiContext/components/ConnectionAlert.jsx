import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";

export const ConnectionAlert = ({ alert, onDismiss }) => {
  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 4500);
    return () => clearTimeout(timer);
  }, [alert, onDismiss]);

  return (
    <AnimatePresence>
      {alert && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          style={{
            position: "fixed",
            top: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            maxWidth: 540,
            width: "calc(100% - 40px)",
            backgroundColor: "#FEF2F2",
            border: "1.5px solid #FCA5A5",
            borderRadius: 12,
            padding: "14px 18px",
            boxShadow: "0 10px 30px rgba(220, 38, 38, 0.15)",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              backgroundColor: "#FEE2E2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              color: "#DC2626",
            }}
          >
            <AlertTriangle size={18} />
          </div>

          <div style={{ flex: 1 }}>
            <h4
              style={{
                margin: 0,
                fontSize: "13.5px",
                fontWeight: 700,
                color: "#991B1B",
                lineHeight: 1.3,
              }}
            >
              Connection Rule Violation
            </h4>
            <p
              style={{
                margin: "4px 0 0 0",
                fontSize: "12px",
                color: "#7F1D1D",
                lineHeight: 1.4,
              }}
            >
              {alert.message}
            </p>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#991B1B",
              padding: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
            }}
          >
            <X size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ConnectionAlert;
