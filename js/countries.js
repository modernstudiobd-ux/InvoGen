// countries.js — country presets (from the approved design). Choosing a country in
// Settings fills in its currency, usual tax name and rate, date and number formats
// and paper size. Everything can still be changed afterwards.
// [ISO code, currency, tax name, standard rate %, tax-number name, { df, nf, paper }]

export const COUNTRIES = [
  ["US", "USD", "Sales tax", 0, "EIN", { df: "MM/DD/YYYY", paper: "Letter", nf: "1,234.56" }],
  ["CA", "CAD", "GST/HST", 5, "GST/HST", { df: "YYYY-MM-DD", paper: "Letter", nf: "1,234.56" }],
  ["MX", "MXN", "IVA", 16, "RFC", { paper: "Letter", nf: "1,234.56" }],
  ["BR", "BRL", "ICMS", 18, "CNPJ", { nf: "1.234,56" }],
  ["AR", "ARS", "IVA", 21, "CUIT", { nf: "1.234,56" }],
  ["CL", "CLP", "IVA", 19, "RUT", { nf: "1.234,56" }],
  ["CO", "COP", "IVA", 19, "NIT", { nf: "1.234,56" }],
  ["PE", "PEN", "IGV", 18, "RUC", {}],
  ["GB", "GBP", "VAT", 20, "VAT", { nf: "1,234.56" }],
  ["IE", "EUR", "VAT", 23, "VAT", { nf: "1,234.56" }],
  ["DE", "EUR", "MwSt.", 19, "USt-IdNr.", { df: "DD.MM.YYYY", nf: "1.234,56" }],
  ["FR", "EUR", "TVA", 20, "N° TVA", { nf: "1 234,56" }],
  ["ES", "EUR", "IVA", 21, "NIF", { nf: "1.234,56" }],
  ["IT", "EUR", "IVA", 22, "P. IVA", { nf: "1.234,56" }],
  ["NL", "EUR", "btw", 21, "btw-id", { df: "DD-MM-YYYY", nf: "1.234,56" }],
  ["BE", "EUR", "BTW", 21, "BTW", { nf: "1.234,56" }],
  ["PT", "EUR", "IVA", 23, "NIF", { nf: "1 234,56" }],
  ["AT", "EUR", "USt.", 20, "UID", { df: "DD.MM.YYYY", nf: "1.234,56" }],
  ["CH", "CHF", "MWST", 8.1, "UID", { df: "DD.MM.YYYY", nf: "1'234.56" }],
  ["PL", "PLN", "VAT", 23, "NIP", { df: "DD.MM.YYYY", nf: "1 234,56" }],
  ["SE", "SEK", "Moms", 25, "Momsreg.nr", { df: "YYYY-MM-DD", nf: "1 234,56" }],
  ["NO", "NOK", "MVA", 25, "Org.nr", { df: "DD.MM.YYYY", nf: "1 234,56" }],
  ["DK", "DKK", "Moms", 25, "CVR", { df: "DD.MM.YYYY", nf: "1.234,56" }],
  ["TR", "TRY", "KDV", 20, "VKN", { df: "DD.MM.YYYY", nf: "1.234,56" }],
  ["RU", "RUB", "НДС", 20, "ИНН", { df: "DD.MM.YYYY", nf: "1 234,56" }],
  ["AE", "AED", "VAT", 5, "TRN", {}],
  ["SA", "SAR", "VAT", 15, "VAT", {}],
  ["IL", "ILS", "VAT", 18, "ID", {}],
  ["EG", "EGP", "VAT", 14, "TRN", {}],
  ["ZA", "ZAR", "VAT", 15, "VAT", { df: "YYYY/MM/DD" }],
  ["NG", "NGN", "VAT", 7.5, "TIN", {}],
  ["KE", "KES", "VAT", 16, "KRA PIN", {}],
  ["IN", "INR", "GST", 18, "GSTIN", { nf: "12,34,567.89" }],
  ["PK", "PKR", "GST", 18, "NTN", {}],
  ["BD", "BDT", "VAT", 15, "BIN", { nf: "12,34,567.89" }],
  ["LK", "LKR", "VAT", 18, "TIN", {}],
  ["NP", "NPR", "VAT", 13, "PAN", {}],
  ["CN", "CNY", "VAT", 13, "税号", { df: "YYYY-MM-DD" }],
  ["JP", "JPY", "消費税", 10, "T", { df: "YYYY年M月D日" }],
  ["KR", "KRW", "VAT", 10, "BRN", { df: "YYYY-MM-DD" }],
  ["TW", "TWD", "VAT", 5, "UBN", { df: "YYYY-MM-DD" }],
  ["HK", "HKD", "Tax", 0, "BR", {}],
  ["SG", "SGD", "GST", 9, "GST Reg. No.", {}],
  ["MY", "MYR", "SST", 8, "SST", {}],
  ["TH", "THB", "VAT", 7, "Tax ID", {}],
  ["ID", "IDR", "PPN", 11, "NPWP", { nf: "1.234,56" }],
  ["VN", "VND", "VAT", 10, "MST", { nf: "1.234,56" }],
  ["PH", "PHP", "VAT", 12, "TIN", { df: "MM/DD/YYYY" }],
  ["AU", "AUD", "GST", 10, "ABN", {}],
  ["NZ", "NZD", "GST", 15, "GST", {}]
];

export const countryOf = code => COUNTRIES.find(c => c[0] === code) || null;

// The settings a country brings with it.
export function countryDefaults(code) {
  const c = countryOf(code);
  if (!c) return null;
  const [, currency, taxName, taxRate, , o] = c;
  return { country: code, currency, taxName, taxRate, dateFormat: o.df || "DD/MM/YYYY", numberFormat: o.nf || "auto", paper: o.paper || "A4" };
}
