export const formatCompact = (value, { currency } = {}) => {
  const number = Number(value || 0);
  const abs = Math.abs(number);
  let formatted = number.toFixed(0);

  if (abs >= 1_000_000) formatted = `${(number / 1_000_000).toFixed(2)}M`;
  else if (abs >= 1_000) formatted = `${(number / 1_000).toFixed(2)}K`;
  else formatted = number.toLocaleString("en-IN", { maximumFractionDigits: 2 });

  return currency === "INR" ? `₹${formatted}` : formatted;
};

export const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

export const greetingForNow = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

export const firstName = (name = "") => name.trim().split(" ")[0] || "there";

export const defaultDateRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 7);
  const toIso = (date) => date.toISOString().slice(0, 10);
  return { startDate: toIso(start), endDate: toIso(end) };
};
