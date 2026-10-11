// words.js — "Amount in words" (e.g. "Nine thousand eight hundred sixty US dollars and twenty-six cents only").
// South Asian currencies use the lakh/crore system, as they are written locally.

import { decimalsOf } from "./format.js";

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function under1000(n) {
  const h = Math.floor(n / 100), r = n % 100, out = [];
  if (h) out.push(ONES[h] + " hundred");
  if (r) out.push(r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? "-" + ONES[r % 10] : ""));
  return out.join(" ");
}
function international(n) {
  if (n === 0) return "zero";
  const scales = [[1e12, "trillion"], [1e9, "billion"], [1e6, "million"], [1e3, "thousand"]], out = [];
  for (const [v, w] of scales) if (n >= v) { out.push(under1000(Math.floor(n / v)) + " " + w); n %= v; }
  if (n) out.push(under1000(n));
  return out.join(" ");
}
function southAsian(n) {
  if (n === 0) return "zero";
  const out = [];
  if (n >= 1e7) { out.push(southAsian(Math.floor(n / 1e7)) + " crore"); n %= 1e7; }
  if (n >= 1e5) { out.push(under1000(Math.floor(n / 1e5)) + " lakh"); n %= 1e5; }
  if (n >= 1e3) { out.push(under1000(Math.floor(n / 1e3)) + " thousand"); n %= 1e3; }
  if (n) out.push(under1000(n));
  return out.join(" ");
}

// [major singular, major plural, minor singular, minor plural]
const NAMES = {
  USD: ["US dollar", "US dollars", "cent", "cents"], CAD: ["Canadian dollar", "Canadian dollars", "cent", "cents"],
  MXN: ["Mexican peso", "Mexican pesos", "centavo", "centavos"], BRL: ["Brazilian real", "Brazilian reais", "centavo", "centavos"],
  ARS: ["Argentine peso", "Argentine pesos", "centavo", "centavos"], CLP: ["Chilean peso", "Chilean pesos"],
  COP: ["Colombian peso", "Colombian pesos", "centavo", "centavos"], PEN: ["sol", "soles", "céntimo", "céntimos"],
  UYU: ["Uruguayan peso", "Uruguayan pesos", "centésimo", "centésimos"], JMD: ["Jamaican dollar", "Jamaican dollars", "cent", "cents"],
  EUR: ["euro", "euros", "cent", "cents"], GBP: ["pound sterling", "pounds sterling", "penny", "pence"],
  CHF: ["Swiss franc", "Swiss francs", "centime", "centimes"], SEK: ["Swedish krona", "Swedish kronor", "öre", "öre"],
  NOK: ["Norwegian krone", "Norwegian kroner", "øre", "øre"], DKK: ["Danish krone", "Danish kroner", "øre", "øre"],
  PLN: ["złoty", "złoty", "grosz", "groszy"], CZK: ["Czech koruna", "Czech korunas", "haléř", "haléřů"],
  HUF: ["forint", "forints", "fillér", "fillér"], RON: ["leu", "lei", "ban", "bani"], UAH: ["hryvnia", "hryvnias", "kopiyka", "kopiyky"],
  RUB: ["rouble", "roubles", "kopek", "kopeks"], TRY: ["Turkish lira", "Turkish lira", "kuruş", "kuruş"],
  AED: ["UAE dirham", "UAE dirhams", "fils", "fils"], SAR: ["Saudi riyal", "Saudi riyals", "halala", "halalas"],
  QAR: ["Qatari riyal", "Qatari riyals", "dirham", "dirhams"], KWD: ["Kuwaiti dinar", "Kuwaiti dinars", "fils", "fils"],
  BHD: ["Bahraini dinar", "Bahraini dinars", "fils", "fils"], OMR: ["Omani rial", "Omani rials", "baisa", "baisa"],
  ILS: ["shekel", "shekels", "agora", "agorot"], EGP: ["Egyptian pound", "Egyptian pounds", "piastre", "piastres"],
  ZAR: ["rand", "rand", "cent", "cents"], NGN: ["naira", "naira", "kobo", "kobo"], KES: ["Kenyan shilling", "Kenyan shillings", "cent", "cents"],
  GHS: ["Ghanaian cedi", "Ghanaian cedis", "pesewa", "pesewas"], AUD: ["Australian dollar", "Australian dollars", "cent", "cents"],
  NZD: ["New Zealand dollar", "New Zealand dollars", "cent", "cents"], JPY: ["yen", "yen"], CNY: ["yuan", "yuan", "fen", "fen"],
  HKD: ["Hong Kong dollar", "Hong Kong dollars", "cent", "cents"], TWD: ["New Taiwan dollar", "New Taiwan dollars", "cent", "cents"],
  KRW: ["won", "won"], SGD: ["Singapore dollar", "Singapore dollars", "cent", "cents"], INR: ["rupee", "rupees", "paisa", "paise"],
  PKR: ["Pakistani rupee", "Pakistani rupees", "paisa", "paise"], BDT: ["taka", "taka", "poisha", "poisha"],
  LKR: ["Sri Lankan rupee", "Sri Lankan rupees", "cent", "cents"], NPR: ["Nepalese rupee", "Nepalese rupees", "paisa", "paise"],
  IDR: ["rupiah", "rupiah", "sen", "sen"], MYR: ["ringgit", "ringgit", "sen", "sen"], PHP: ["Philippine peso", "Philippine pesos", "centavo", "centavos"],
  THB: ["baht", "baht", "satang", "satang"], VND: ["dong", "dong"]
};
const SOUTH_ASIAN = new Set(["INR", "BDT", "PKR", "NPR", "LKR"]);

export function amountInWords(value, code) {
  const d = decimalsOf(code), f = Math.pow(10, d);
  let v = Math.round(Math.abs(Number(value) || 0) * f);
  const major = Math.floor(v / f), minor = v % f;
  const nm = NAMES[code] || [code, code];
  const say = SOUTH_ASIAN.has(code) ? southAsian : international;
  let out = say(major) + " " + (major === 1 ? nm[0] : nm[1]);
  if (minor && d > 0) out += " and " + say(minor) + " " + (minor === 1 ? (nm[2] || "cent") : (nm[3] || "cents"));
  out += " only";
  return (Number(value) < 0 ? "minus " : "") + out.charAt(0).toUpperCase() + out.slice(1);
}
