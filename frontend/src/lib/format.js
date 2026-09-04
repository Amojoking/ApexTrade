export const fmtMoney = (n, opts = {}) => {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const abs = Math.abs(n);
  const digits = opts.digits ?? (abs < 1 ? 4 : abs < 100 ? 2 : 2);
  return n.toLocaleString("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
};

export const fmtNumber = (n, digits = 2) => {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
};

export const fmtPct = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
};

export const fmtCompact = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
};

export const trendClass = (n) => (n >= 0 ? "text-[#089981]" : "text-[#F23645]");
