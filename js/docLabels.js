// docLabels.js — words printed ON the document (title, Bill to, Subtotal, Balance due …) in
// 24 document languages. Separate from the app's own interface language, so you can run
// the app in English and send a document in Arabic or Bangla. Arrays are [invoice, estimate, receipt].

export const DOC_LANGS = [["en", "English", "ltr"], ["zh", "中文", "ltr"], ["es", "Español", "ltr"], ["hi", "हिन्दी", "ltr"], ["ar", "العربية", "rtl"], ["bn", "বাংলা", "ltr"], ["pt", "Português", "ltr"], ["ru", "Русский", "ltr"], ["ja", "日本語", "ltr"], ["de", "Deutsch", "ltr"], ["fr", "Français", "ltr"], ["ur", "اردو", "rtl"], ["id", "Bahasa Indonesia", "ltr"], ["tr", "Türkçe", "ltr"], ["ko", "한국어", "ltr"], ["vi", "Tiếng Việt", "ltr"], ["it", "Italiano", "ltr"], ["fa", "فارسی", "rtl"], ["th", "ไทย", "ltr"], ["pl", "Polski", "ltr"], ["uk", "Українська", "ltr"], ["nl", "Nederlands", "ltr"], ["ms", "Bahasa Melayu", "ltr"], ["sw", "Kiswahili", "ltr"]];

const T = {
 "en": {
  "title": [
   "INVOICE",
   "ESTIMATE",
   "RECEIPT"
  ],
  "bill": [
   "BILL TO",
   "PREPARED FOR",
   "RECEIVED FROM"
  ],
  "date": [
   "Invoice date",
   "Estimate date",
   "Receipt date"
  ],
  "due": [
   "Due date",
   "Valid until",
   "Payment date"
  ],
  "balance": [
   "Balance due",
   "Estimated total",
   "Amount paid"
  ],
  "noun": [
   "Invoice",
   "Estimate",
   "Receipt"
  ],
  "ref": "Reference",
  "note": "NOTE",
  "payment": "PAYMENT DETAILS",
  "terms": "TERMS",
  "payTerms": "Payment terms",
  "tax": "Tax",
  "paid": "Amount paid",
  "subtotal": "Subtotal",
  "discount": "Discount",
  "shipping": "Shipping",
  "total": "Total",
  "balanceRow": "Balance due",
  "itemTax": "Item tax",
  "words": "Amount in words",
  "payOnline": "Pay online",
  "scan": "Scan to pay",
  "sign": "Authorized signature",
  "receipt": "Due on receipt",
  "net": "Net {n}",
  "cols": {
   "sku": "SKU",
   "description": "Description",
   "quantity": "Qty",
   "rate": "Rate",
   "amount": "Amount",
   "unit": "Unit"
  },
  "deposit": "Deposit due now",
  "lateFee": "Late fee",
  "method": "Payment method",
  "wmDraft": "DRAFT",
  "wmPaid": "PAID",
  "wmCopy": "COPY"
 },
 "zh": {
  "title": [
   "发票",
   "报价单",
   "收据"
  ],
  "bill": [
   "收票方",
   "报价对象",
   "付款方"
  ],
  "date": [
   "开票日期",
   "报价日期",
   "收据日期"
  ],
  "due": [
   "到期日",
   "有效期至",
   "付款日期"
  ],
  "balance": [
   "应付余额",
   "预估总额",
   "已付金额"
  ],
  "noun": [
   "发票",
   "报价单",
   "收据"
  ],
  "ref": "参考编号",
  "note": "备注",
  "payment": "付款信息",
  "terms": "条款",
  "payTerms": "付款条件",
  "tax": "税",
  "paid": "已付金额",
  "subtotal": "小计",
  "discount": "折扣",
  "shipping": "运费",
  "total": "合计",
  "balanceRow": "应付余额",
  "itemTax": "单项税",
  "words": "金额（文字）",
  "payOnline": "在线支付",
  "scan": "扫码支付",
  "sign": "授权签字",
  "receipt": "收到即付",
  "net": "{n} 天内付款",
  "cols": {
   "sku": "编号",
   "description": "描述",
   "quantity": "数量",
   "rate": "单价",
   "amount": "金额",
   "unit": "单位"
  },
  "deposit": "应付定金",
  "lateFee": "滞纳金",
  "method": "付款方式",
  "wmDraft": "草稿",
  "wmPaid": "已付款",
  "wmCopy": "副本"
 },
 "es": {
  "title": [
   "FACTURA",
   "PRESUPUESTO",
   "RECIBO"
  ],
  "bill": [
   "FACTURAR A",
   "PREPARADO PARA",
   "RECIBIDO DE"
  ],
  "date": [
   "Fecha de factura",
   "Fecha del presupuesto",
   "Fecha del recibo"
  ],
  "due": [
   "Fecha de vencimiento",
   "Válido hasta",
   "Fecha de pago"
  ],
  "balance": [
   "Saldo pendiente",
   "Total estimado",
   "Importe pagado"
  ],
  "noun": [
   "Factura",
   "Presupuesto",
   "Recibo"
  ],
  "ref": "Referencia",
  "note": "NOTA",
  "payment": "DATOS DE PAGO",
  "terms": "CONDICIONES",
  "payTerms": "Condiciones de pago",
  "tax": "Impuesto",
  "paid": "Importe pagado",
  "subtotal": "Subtotal",
  "discount": "Descuento",
  "shipping": "Envío",
  "total": "Total",
  "balanceRow": "Saldo pendiente",
  "itemTax": "Impuesto por artículo",
  "words": "Importe en letras",
  "payOnline": "Pagar en línea",
  "scan": "Escanea para pagar",
  "sign": "Firma autorizada",
  "receipt": "Pago al recibir",
  "net": "{n} días",
  "cols": {
   "sku": "Código",
   "description": "Descripción",
   "quantity": "Cant.",
   "rate": "Precio",
   "amount": "Importe",
   "unit": "Unidad"
  },
  "deposit": "Anticipo a pagar",
  "lateFee": "Recargo por demora",
  "method": "Forma de pago",
  "wmDraft": "BORRADOR",
  "wmPaid": "PAGADO",
  "wmCopy": "COPIA"
 },
 "hi": {
  "title": [
   "इनवॉइस",
   "अनुमान",
   "रसीद"
  ],
  "bill": [
   "बिल प्राप्तकर्ता",
   "किसके लिए",
   "प्राप्त किया"
  ],
  "date": [
   "इनवॉइस तिथि",
   "अनुमान तिथि",
   "रसीद तिथि"
  ],
  "due": [
   "देय तिथि",
   "मान्य तिथि तक",
   "भुगतान तिथि"
  ],
  "balance": [
   "देय राशि",
   "अनुमानित कुल",
   "भुगतान की गई राशि"
  ],
  "noun": [
   "इनवॉइस",
   "अनुमान",
   "रसीद"
  ],
  "ref": "संदर्भ",
  "note": "नोट",
  "payment": "भुगतान विवरण",
  "terms": "शर्तें",
  "payTerms": "भुगतान शर्तें",
  "tax": "कर",
  "paid": "भुगतान की गई राशि",
  "subtotal": "उप-योग",
  "discount": "छूट",
  "shipping": "शिपिंग",
  "total": "कुल",
  "balanceRow": "देय राशि",
  "itemTax": "मद कर",
  "words": "शब्दों में राशि",
  "payOnline": "ऑनलाइन भुगतान करें",
  "scan": "भुगतान हेतु स्कैन करें",
  "sign": "अधिकृत हस्ताक्षर",
  "receipt": "प्राप्ति पर देय",
  "net": "{n} दिनों में",
  "cols": {
   "sku": "कोड",
   "description": "विवरण",
   "quantity": "मात्रा",
   "rate": "दर",
   "amount": "राशि",
   "unit": "इकाई"
  },
  "deposit": "अभी देय अग्रिम",
  "lateFee": "विलंब शुल्क",
  "method": "भुगतान का तरीका",
  "wmDraft": "ड्राफ़्ट",
  "wmPaid": "भुगतान हो गया",
  "wmCopy": "प्रति"
 },
 "ar": {
  "title": [
   "فاتورة",
   "عرض سعر",
   "إيصال"
  ],
  "bill": [
   "فاتورة إلى",
   "مُعدّ لـ",
   "مستلم من"
  ],
  "date": [
   "تاريخ الفاتورة",
   "تاريخ العرض",
   "تاريخ الإيصال"
  ],
  "due": [
   "تاريخ الاستحقاق",
   "صالح حتى",
   "تاريخ الدفع"
  ],
  "balance": [
   "الرصيد المستحق",
   "الإجمالي التقديري",
   "المبلغ المدفوع"
  ],
  "noun": [
   "فاتورة",
   "عرض سعر",
   "إيصال"
  ],
  "ref": "المرجع",
  "note": "ملاحظة",
  "payment": "تفاصيل الدفع",
  "terms": "الشروط",
  "payTerms": "شروط الدفع",
  "tax": "الضريبة",
  "paid": "المبلغ المدفوع",
  "subtotal": "المجموع الفرعي",
  "discount": "الخصم",
  "shipping": "الشحن",
  "total": "الإجمالي",
  "balanceRow": "الرصيد المستحق",
  "itemTax": "ضريبة البنود",
  "words": "المبلغ كتابةً",
  "payOnline": "ادفع عبر الإنترنت",
  "scan": "امسح للدفع",
  "sign": "التوقيع المعتمد",
  "receipt": "مستحق عند الاستلام",
  "net": "خلال {n} يومًا",
  "cols": {
   "sku": "الرمز",
   "description": "الوصف",
   "quantity": "الكمية",
   "rate": "السعر",
   "amount": "المبلغ",
   "unit": "الوحدة"
  },
  "deposit": "الدفعة المقدمة المستحقة",
  "lateFee": "رسوم التأخير",
  "method": "طريقة الدفع",
  "wmDraft": "مسودة",
  "wmPaid": "مدفوع",
  "wmCopy": "نسخة"
 },
 "bn": {
  "title": [
   "ইনভয়েস",
   "এস্টিমেট",
   "রসিদ"
  ],
  "bill": [
   "বিল প্রাপক",
   "যার জন্য প্রস্তুত",
   "যার কাছ থেকে প্রাপ্ত"
  ],
  "date": [
   "ইনভয়েসের তারিখ",
   "এস্টিমেটের তারিখ",
   "রসিদের তারিখ"
  ],
  "due": [
   "পরিশোধের শেষ তারিখ",
   "মেয়াদ শেষ",
   "পরিশোধের তারিখ"
  ],
  "balance": [
   "বকেয়া",
   "আনুমানিক মোট",
   "পরিশোধিত"
  ],
  "noun": [
   "ইনভয়েস",
   "এস্টিমেট",
   "রসিদ"
  ],
  "ref": "রেফারেন্স",
  "note": "নোট",
  "payment": "পেমেন্টের বিবরণ",
  "terms": "শর্তাবলি",
  "payTerms": "পেমেন্টের শর্ত",
  "tax": "কর",
  "paid": "পরিশোধিত",
  "subtotal": "উপমোট",
  "discount": "ছাড়",
  "shipping": "ডেলিভারি",
  "total": "মোট",
  "balanceRow": "বকেয়া",
  "itemTax": "পণ্যভিত্তিক কর",
  "words": "কথায়",
  "payOnline": "অনলাইনে পরিশোধ করুন",
  "scan": "পরিশোধ করতে স্ক্যান করুন",
  "sign": "অনুমোদিত স্বাক্ষর",
  "receipt": "প্রাপ্তির সাথে সাথে",
  "net": "{n} দিনের মধ্যে",
  "cols": {
   "sku": "কোড",
   "description": "বিবরণ",
   "quantity": "সংখ্যা",
   "rate": "দর",
   "amount": "মূল্য",
   "unit": "একক"
  },
  "deposit": "এখন দেয় অগ্রিম",
  "lateFee": "বিলম্ব ফি",
  "method": "পরিশোধের পদ্ধতি",
  "wmDraft": "খসড়া",
  "wmPaid": "পরিশোধিত",
  "wmCopy": "কপি"
 },
 "pt": {
  "title": [
   "FATURA",
   "ORÇAMENTO",
   "RECIBO"
  ],
  "bill": [
   "FATURAR A",
   "PREPARADO PARA",
   "RECEBIDO DE"
  ],
  "date": [
   "Data da fatura",
   "Data do orçamento",
   "Data do recibo"
  ],
  "due": [
   "Data de vencimento",
   "Válido até",
   "Data de pagamento"
  ],
  "balance": [
   "Saldo devedor",
   "Total estimado",
   "Valor pago"
  ],
  "noun": [
   "Fatura",
   "Orçamento",
   "Recibo"
  ],
  "ref": "Referência",
  "note": "NOTA",
  "payment": "DADOS DE PAGAMENTO",
  "terms": "TERMOS",
  "payTerms": "Condições de pagamento",
  "tax": "Imposto",
  "paid": "Valor pago",
  "subtotal": "Subtotal",
  "discount": "Desconto",
  "shipping": "Frete",
  "total": "Total",
  "balanceRow": "Saldo devedor",
  "itemTax": "Imposto por item",
  "words": "Valor por extenso",
  "payOnline": "Pagar online",
  "scan": "Escaneie para pagar",
  "sign": "Assinatura autorizada",
  "receipt": "Pagamento no recebimento",
  "net": "{n} dias",
  "cols": {
   "sku": "Código",
   "description": "Descrição",
   "quantity": "Qtd.",
   "rate": "Preço",
   "amount": "Valor",
   "unit": "Unidade"
  },
  "deposit": "Entrada a pagar",
  "lateFee": "Multa por atraso",
  "method": "Forma de pagamento",
  "wmDraft": "RASCUNHO",
  "wmPaid": "PAGO",
  "wmCopy": "CÓPIA"
 },
 "ru": {
  "title": [
   "СЧЁТ",
   "СМЕТА",
   "КВИТАНЦИЯ"
  ],
  "bill": [
   "ПЛАТЕЛЬЩИК",
   "ПОДГОТОВЛЕНО ДЛЯ",
   "ПОЛУЧЕНО ОТ"
  ],
  "date": [
   "Дата счёта",
   "Дата сметы",
   "Дата квитанции"
  ],
  "due": [
   "Срок оплаты",
   "Действительно до",
   "Дата оплаты"
  ],
  "balance": [
   "К оплате",
   "Итого по смете",
   "Оплачено"
  ],
  "noun": [
   "Счёт",
   "Смета",
   "Квитанция"
  ],
  "ref": "Номер заказа",
  "note": "ПРИМЕЧАНИЕ",
  "payment": "РЕКВИЗИТЫ ДЛЯ ОПЛАТЫ",
  "terms": "УСЛОВИЯ",
  "payTerms": "Условия оплаты",
  "tax": "Налог",
  "paid": "Оплачено",
  "subtotal": "Промежуточный итог",
  "discount": "Скидка",
  "shipping": "Доставка",
  "total": "Итого",
  "balanceRow": "К оплате",
  "itemTax": "Налог по позициям",
  "words": "Сумма прописью",
  "payOnline": "Оплатить онлайн",
  "scan": "Сканируйте для оплаты",
  "sign": "Подпись уполномоченного лица",
  "receipt": "Оплата при получении",
  "net": "{n} дней",
  "cols": {
   "sku": "Артикул",
   "description": "Описание",
   "quantity": "Кол-во",
   "rate": "Цена",
   "amount": "Сумма",
   "unit": "Ед."
  },
  "deposit": "Предоплата к оплате",
  "lateFee": "Пеня за просрочку",
  "method": "Способ оплаты",
  "wmDraft": "ЧЕРНОВИК",
  "wmPaid": "ОПЛАЧЕНО",
  "wmCopy": "КОПИЯ"
 },
 "ja": {
  "title": [
   "請求書",
   "見積書",
   "領収書"
  ],
  "bill": [
   "請求先",
   "見積先",
   "お支払者"
  ],
  "date": [
   "請求日",
   "見積日",
   "領収日"
  ],
  "due": [
   "支払期限",
   "有効期限",
   "支払日"
  ],
  "balance": [
   "ご請求金額",
   "見積合計",
   "お支払金額"
  ],
  "noun": [
   "請求書",
   "見積書",
   "領収書"
  ],
  "ref": "参照番号",
  "note": "備考",
  "payment": "お振込先",
  "terms": "取引条件",
  "payTerms": "支払条件",
  "tax": "税",
  "paid": "お支払済額",
  "subtotal": "小計",
  "discount": "割引",
  "shipping": "送料",
  "total": "合計",
  "balanceRow": "未払残高",
  "itemTax": "品目別税",
  "words": "金額（文字）",
  "payOnline": "オンラインで支払う",
  "scan": "スキャンして支払う",
  "sign": "署名",
  "receipt": "受領時払い",
  "net": "{n}日以内",
  "cols": {
   "sku": "品番",
   "description": "品目",
   "quantity": "数量",
   "rate": "単価",
   "amount": "金額",
   "unit": "単位"
  },
  "deposit": "今回の前払金",
  "lateFee": "延滞料",
  "method": "支払方法",
  "wmDraft": "下書き",
  "wmPaid": "支払済",
  "wmCopy": "控え"
 },
 "de": {
  "title": [
   "RECHNUNG",
   "ANGEBOT",
   "QUITTUNG"
  ],
  "bill": [
   "RECHNUNG AN",
   "ERSTELLT FÜR",
   "ERHALTEN VON"
  ],
  "date": [
   "Rechnungsdatum",
   "Angebotsdatum",
   "Quittungsdatum"
  ],
  "due": [
   "Fälligkeitsdatum",
   "Gültig bis",
   "Zahlungsdatum"
  ],
  "balance": [
   "Offener Betrag",
   "Geschätzte Summe",
   "Bezahlter Betrag"
  ],
  "noun": [
   "Rechnung",
   "Angebot",
   "Quittung"
  ],
  "ref": "Referenz",
  "note": "HINWEIS",
  "payment": "ZAHLUNGSINFORMATIONEN",
  "terms": "BEDINGUNGEN",
  "payTerms": "Zahlungsbedingungen",
  "tax": "Steuer",
  "paid": "Bezahlter Betrag",
  "subtotal": "Zwischensumme",
  "discount": "Rabatt",
  "shipping": "Versand",
  "total": "Gesamt",
  "balanceRow": "Offener Betrag",
  "itemTax": "Positionssteuer",
  "words": "Betrag in Worten",
  "payOnline": "Online bezahlen",
  "scan": "Zum Bezahlen scannen",
  "sign": "Autorisierte Unterschrift",
  "receipt": "Zahlbar bei Erhalt",
  "net": "{n} Tage netto",
  "cols": {
   "sku": "Art.-Nr.",
   "description": "Beschreibung",
   "quantity": "Menge",
   "rate": "Preis",
   "amount": "Betrag",
   "unit": "Einheit"
  },
  "deposit": "Jetzt fällige Anzahlung",
  "lateFee": "Säumniszuschlag",
  "method": "Zahlungsart",
  "wmDraft": "ENTWURF",
  "wmPaid": "BEZAHLT",
  "wmCopy": "KOPIE"
 },
 "fr": {
  "title": [
   "FACTURE",
   "DEVIS",
   "REÇU"
  ],
  "bill": [
   "FACTURÉ À",
   "PRÉPARÉ POUR",
   "REÇU DE"
  ],
  "date": [
   "Date de facture",
   "Date du devis",
   "Date du reçu"
  ],
  "due": [
   "Date d'échéance",
   "Valable jusqu'au",
   "Date de paiement"
  ],
  "balance": [
   "Solde dû",
   "Total estimé",
   "Montant payé"
  ],
  "noun": [
   "Facture",
   "Devis",
   "Reçu"
  ],
  "ref": "Référence",
  "note": "NOTE",
  "payment": "COORDONNÉES DE PAIEMENT",
  "terms": "CONDITIONS",
  "payTerms": "Conditions de paiement",
  "tax": "Taxe",
  "paid": "Montant payé",
  "subtotal": "Sous-total",
  "discount": "Remise",
  "shipping": "Livraison",
  "total": "Total",
  "balanceRow": "Solde dû",
  "itemTax": "Taxe par article",
  "words": "Montant en lettres",
  "payOnline": "Payer en ligne",
  "scan": "Scannez pour payer",
  "sign": "Signature autorisée",
  "receipt": "Payable à réception",
  "net": "{n} jours",
  "cols": {
   "sku": "Réf.",
   "description": "Description",
   "quantity": "Qté",
   "rate": "Prix unitaire",
   "amount": "Montant",
   "unit": "Unité"
  },
  "deposit": "Acompte à régler",
  "lateFee": "Pénalité de retard",
  "method": "Mode de paiement",
  "wmDraft": "BROUILLON",
  "wmPaid": "PAYÉ",
  "wmCopy": "COPIE"
 },
 "ur": {
  "title": [
   "انوائس",
   "تخمینہ",
   "رسید"
  ],
  "bill": [
   "بل بنام",
   "برائے",
   "منجانب"
  ],
  "date": [
   "انوائس کی تاریخ",
   "تخمینے کی تاریخ",
   "رسید کی تاریخ"
  ],
  "due": [
   "آخری تاریخِ ادائیگی",
   "تک کارآمد",
   "ادائیگی کی تاریخ"
  ],
  "balance": [
   "واجب الادا رقم",
   "تخمینی کل",
   "ادا شدہ رقم"
  ],
  "noun": [
   "انوائس",
   "تخمینہ",
   "رسید"
  ],
  "ref": "حوالہ",
  "note": "نوٹ",
  "payment": "ادائیگی کی تفصیلات",
  "terms": "شرائط",
  "payTerms": "ادائیگی کی شرائط",
  "tax": "ٹیکس",
  "paid": "ادا شدہ رقم",
  "subtotal": "ذیلی کل",
  "discount": "رعایت",
  "shipping": "ترسیل",
  "total": "کل",
  "balanceRow": "واجب الادا رقم",
  "itemTax": "فی آئٹم ٹیکس",
  "words": "رقم الفاظ میں",
  "payOnline": "آن لائن ادائیگی کریں",
  "scan": "ادائیگی کے لیے اسکین کریں",
  "sign": "مجاز دستخط",
  "receipt": "وصولی پر ادائیگی",
  "net": "{n} دن",
  "cols": {
   "sku": "کوڈ",
   "description": "تفصیل",
   "quantity": "تعداد",
   "rate": "نرخ",
   "amount": "رقم",
   "unit": "اکائی"
  },
  "deposit": "ابھی واجب الادا پیشگی",
  "lateFee": "تاخیر کی فیس",
  "method": "ادائیگی کا طریقہ",
  "wmDraft": "مسودہ",
  "wmPaid": "ادا شدہ",
  "wmCopy": "نقل"
 },
 "id": {
  "title": [
   "FAKTUR",
   "PENAWARAN",
   "KUITANSI"
  ],
  "bill": [
   "DITAGIHKAN KEPADA",
   "DISIAPKAN UNTUK",
   "DITERIMA DARI"
  ],
  "date": [
   "Tanggal faktur",
   "Tanggal penawaran",
   "Tanggal kuitansi"
  ],
  "due": [
   "Jatuh tempo",
   "Berlaku hingga",
   "Tanggal pembayaran"
  ],
  "balance": [
   "Sisa tagihan",
   "Perkiraan total",
   "Jumlah dibayar"
  ],
  "noun": [
   "Faktur",
   "Penawaran",
   "Kuitansi"
  ],
  "ref": "Referensi",
  "note": "CATATAN",
  "payment": "DETAIL PEMBAYARAN",
  "terms": "KETENTUAN",
  "payTerms": "Syarat pembayaran",
  "tax": "Pajak",
  "paid": "Jumlah dibayar",
  "subtotal": "Subtotal",
  "discount": "Diskon",
  "shipping": "Ongkos kirim",
  "total": "Total",
  "balanceRow": "Sisa tagihan",
  "itemTax": "Pajak per item",
  "words": "Terbilang",
  "payOnline": "Bayar online",
  "scan": "Pindai untuk membayar",
  "sign": "Tanda tangan resmi",
  "receipt": "Bayar saat diterima",
  "net": "{n} hari",
  "cols": {
   "sku": "Kode",
   "description": "Deskripsi",
   "quantity": "Jml",
   "rate": "Harga",
   "amount": "Jumlah",
   "unit": "Satuan"
  },
  "deposit": "Uang muka jatuh tempo",
  "lateFee": "Denda keterlambatan",
  "method": "Metode pembayaran",
  "wmDraft": "DRAF",
  "wmPaid": "LUNAS",
  "wmCopy": "SALINAN"
 },
 "tr": {
  "title": [
   "FATURA",
   "TEKLİF",
   "MAKBUZ"
  ],
  "bill": [
   "FATURA EDİLEN",
   "HAZIRLANAN",
   "ÖDEYEN"
  ],
  "date": [
   "Fatura tarihi",
   "Teklif tarihi",
   "Makbuz tarihi"
  ],
  "due": [
   "Son ödeme tarihi",
   "Geçerlilik tarihi",
   "Ödeme tarihi"
  ],
  "balance": [
   "Ödenecek tutar",
   "Tahmini toplam",
   "Ödenen tutar"
  ],
  "noun": [
   "Fatura",
   "Teklif",
   "Makbuz"
  ],
  "ref": "Referans",
  "note": "NOT",
  "payment": "ÖDEME BİLGİLERİ",
  "terms": "KOŞULLAR",
  "payTerms": "Ödeme koşulları",
  "tax": "Vergi",
  "paid": "Ödenen tutar",
  "subtotal": "Ara toplam",
  "discount": "İndirim",
  "shipping": "Kargo",
  "total": "Toplam",
  "balanceRow": "Kalan tutar",
  "itemTax": "Kalem vergisi",
  "words": "Yazıyla tutar",
  "payOnline": "Çevrimiçi öde",
  "scan": "Ödemek için tarayın",
  "sign": "Yetkili imza",
  "receipt": "Teslimde ödeme",
  "net": "{n} gün",
  "cols": {
   "sku": "Kod",
   "description": "Açıklama",
   "quantity": "Miktar",
   "rate": "Birim fiyat",
   "amount": "Tutar",
   "unit": "Birim"
  },
  "deposit": "Şimdi ödenecek kapora",
  "lateFee": "Gecikme bedeli",
  "method": "Ödeme yöntemi",
  "wmDraft": "TASLAK",
  "wmPaid": "ÖDENDİ",
  "wmCopy": "KOPYA"
 },
 "ko": {
  "title": [
   "청구서",
   "견적서",
   "영수증"
  ],
  "bill": [
   "청구 대상",
   "견적 대상",
   "지불인"
  ],
  "date": [
   "청구일",
   "견적일",
   "영수일"
  ],
  "due": [
   "지급 기한",
   "유효 기한",
   "지급일"
  ],
  "balance": [
   "청구 금액",
   "예상 합계",
   "지급 금액"
  ],
  "noun": [
   "청구서",
   "견적서",
   "영수증"
  ],
  "ref": "참조 번호",
  "note": "메모",
  "payment": "결제 정보",
  "terms": "약관",
  "payTerms": "결제 조건",
  "tax": "세금",
  "paid": "지급액",
  "subtotal": "소계",
  "discount": "할인",
  "shipping": "배송비",
  "total": "합계",
  "balanceRow": "미지급 잔액",
  "itemTax": "품목별 세금",
  "words": "금액(문자)",
  "payOnline": "온라인 결제",
  "scan": "스캔하여 결제",
  "sign": "서명",
  "receipt": "수령 시 지급",
  "net": "{n}일 이내",
  "cols": {
   "sku": "코드",
   "description": "품목",
   "quantity": "수량",
   "rate": "단가",
   "amount": "금액",
   "unit": "단위"
  },
  "deposit": "선금 납부액",
  "lateFee": "연체료",
  "method": "결제 방법",
  "wmDraft": "초안",
  "wmPaid": "결제 완료",
  "wmCopy": "사본"
 },
 "vi": {
  "title": [
   "HÓA ĐƠN",
   "BÁO GIÁ",
   "BIÊN NHẬN"
  ],
  "bill": [
   "KHÁCH HÀNG",
   "GỬI ĐẾN",
   "NHẬN TỪ"
  ],
  "date": [
   "Ngày lập",
   "Ngày báo giá",
   "Ngày biên nhận"
  ],
  "due": [
   "Hạn thanh toán",
   "Có hiệu lực đến",
   "Ngày thanh toán"
  ],
  "balance": [
   "Số tiền phải trả",
   "Tổng dự kiến",
   "Số tiền đã trả"
  ],
  "noun": [
   "Hóa đơn",
   "Báo giá",
   "Biên nhận"
  ],
  "ref": "Mã tham chiếu",
  "note": "GHI CHÚ",
  "payment": "THÔNG TIN THANH TOÁN",
  "terms": "ĐIỀU KHOẢN",
  "payTerms": "Điều khoản thanh toán",
  "tax": "Thuế",
  "paid": "Đã thanh toán",
  "subtotal": "Tạm tính",
  "discount": "Giảm giá",
  "shipping": "Phí vận chuyển",
  "total": "Tổng cộng",
  "balanceRow": "Còn phải trả",
  "itemTax": "Thuế theo mặt hàng",
  "words": "Số tiền bằng chữ",
  "payOnline": "Thanh toán trực tuyến",
  "scan": "Quét để thanh toán",
  "sign": "Chữ ký người có thẩm quyền",
  "receipt": "Thanh toán khi nhận",
  "net": "{n} ngày",
  "cols": {
   "sku": "Mã",
   "description": "Mô tả",
   "quantity": "SL",
   "rate": "Đơn giá",
   "amount": "Thành tiền",
   "unit": "Đơn vị"
  },
  "deposit": "Tiền đặt cọc cần trả",
  "lateFee": "Phí trả chậm",
  "method": "Phương thức thanh toán",
  "wmDraft": "BẢN NHÁP",
  "wmPaid": "ĐÃ THANH TOÁN",
  "wmCopy": "BẢN SAO"
 },
 "it": {
  "title": [
   "FATTURA",
   "PREVENTIVO",
   "RICEVUTA"
  ],
  "bill": [
   "INTESTATARIO",
   "PREPARATO PER",
   "RICEVUTO DA"
  ],
  "date": [
   "Data fattura",
   "Data preventivo",
   "Data ricevuta"
  ],
  "due": [
   "Scadenza",
   "Valido fino al",
   "Data di pagamento"
  ],
  "balance": [
   "Saldo dovuto",
   "Totale stimato",
   "Importo pagato"
  ],
  "noun": [
   "Fattura",
   "Preventivo",
   "Ricevuta"
  ],
  "ref": "Riferimento",
  "note": "NOTA",
  "payment": "DATI DI PAGAMENTO",
  "terms": "TERMINI",
  "payTerms": "Termini di pagamento",
  "tax": "Imposta",
  "paid": "Importo pagato",
  "subtotal": "Subtotale",
  "discount": "Sconto",
  "shipping": "Spedizione",
  "total": "Totale",
  "balanceRow": "Saldo dovuto",
  "itemTax": "Imposta per articolo",
  "words": "Importo in lettere",
  "payOnline": "Paga online",
  "scan": "Scansiona per pagare",
  "sign": "Firma autorizzata",
  "receipt": "Pagamento alla ricezione",
  "net": "{n} giorni",
  "cols": {
   "sku": "Codice",
   "description": "Descrizione",
   "quantity": "Q.tà",
   "rate": "Prezzo",
   "amount": "Importo",
   "unit": "Unità"
  },
  "deposit": "Acconto dovuto ora",
  "lateFee": "Mora per ritardo",
  "method": "Metodo di pagamento",
  "wmDraft": "BOZZA",
  "wmPaid": "PAGATO",
  "wmCopy": "COPIA"
 },
 "fa": {
  "title": [
   "فاکتور",
   "پیش‌فاکتور",
   "رسید"
  ],
  "bill": [
   "صورتحساب برای",
   "تهیه‌شده برای",
   "دریافت از"
  ],
  "date": [
   "تاریخ فاکتور",
   "تاریخ پیش‌فاکتور",
   "تاریخ رسید"
  ],
  "due": [
   "سررسید پرداخت",
   "معتبر تا",
   "تاریخ پرداخت"
  ],
  "balance": [
   "مبلغ قابل پرداخت",
   "جمع تخمینی",
   "مبلغ پرداخت‌شده"
  ],
  "noun": [
   "فاکتور",
   "پیش‌فاکتور",
   "رسید"
  ],
  "ref": "شماره مرجع",
  "note": "یادداشت",
  "payment": "اطلاعات پرداخت",
  "terms": "شرایط",
  "payTerms": "شرایط پرداخت",
  "tax": "مالیات",
  "paid": "پرداخت‌شده",
  "subtotal": "جمع جزء",
  "discount": "تخفیف",
  "shipping": "هزینه ارسال",
  "total": "جمع کل",
  "balanceRow": "مانده قابل پرداخت",
  "itemTax": "مالیات هر قلم",
  "words": "مبلغ به حروف",
  "payOnline": "پرداخت آنلاین",
  "scan": "برای پرداخت اسکن کنید",
  "sign": "امضای مجاز",
  "receipt": "پرداخت هنگام دریافت",
  "net": "{n} روزه",
  "cols": {
   "sku": "کد",
   "description": "شرح",
   "quantity": "تعداد",
   "rate": "فی",
   "amount": "مبلغ",
   "unit": "واحد"
  },
  "deposit": "پیش‌پرداخت قابل پرداخت",
  "lateFee": "جریمه دیرکرد",
  "method": "روش پرداخت",
  "wmDraft": "پیش‌نویس",
  "wmPaid": "پرداخت‌شده",
  "wmCopy": "رونوشت"
 },
 "th": {
  "title": [
   "ใบแจ้งหนี้",
   "ใบเสนอราคา",
   "ใบเสร็จรับเงิน"
  ],
  "bill": [
   "เรียกเก็บจาก",
   "จัดทำสำหรับ",
   "ได้รับจาก"
  ],
  "date": [
   "วันที่ออกใบแจ้งหนี้",
   "วันที่เสนอราคา",
   "วันที่ออกใบเสร็จ"
  ],
  "due": [
   "วันครบกำหนดชำระ",
   "ใช้ได้ถึง",
   "วันที่ชำระเงิน"
  ],
  "balance": [
   "ยอดค้างชำระ",
   "ยอดรวมโดยประมาณ",
   "ยอดที่ชำระแล้ว"
  ],
  "noun": [
   "ใบแจ้งหนี้",
   "ใบเสนอราคา",
   "ใบเสร็จ"
  ],
  "ref": "เลขที่อ้างอิง",
  "note": "หมายเหตุ",
  "payment": "ข้อมูลการชำระเงิน",
  "terms": "เงื่อนไข",
  "payTerms": "เงื่อนไขการชำระเงิน",
  "tax": "ภาษี",
  "paid": "ชำระแล้ว",
  "subtotal": "ยอดรวมย่อย",
  "discount": "ส่วนลด",
  "shipping": "ค่าจัดส่ง",
  "total": "ยอดรวม",
  "balanceRow": "ยอดค้างชำระ",
  "itemTax": "ภาษีรายสินค้า",
  "words": "จำนวนเงินเป็นตัวอักษร",
  "payOnline": "ชำระเงินออนไลน์",
  "scan": "สแกนเพื่อชำระเงิน",
  "sign": "ผู้มีอำนาจลงนาม",
  "receipt": "ชำระเมื่อได้รับ",
  "net": "{n} วัน",
  "cols": {
   "sku": "รหัส",
   "description": "รายการ",
   "quantity": "จำนวน",
   "rate": "ราคาต่อหน่วย",
   "amount": "จำนวนเงิน",
   "unit": "หน่วย"
  },
  "deposit": "เงินมัดจำที่ต้องชำระ",
  "lateFee": "ค่าปรับล่าช้า",
  "method": "วิธีชำระเงิน",
  "wmDraft": "ฉบับร่าง",
  "wmPaid": "ชำระแล้ว",
  "wmCopy": "สำเนา"
 },
 "pl": {
  "title": [
   "FAKTURA",
   "OFERTA",
   "POKWITOWANIE"
  ],
  "bill": [
   "NABYWCA",
   "PRZYGOTOWANO DLA",
   "OTRZYMANO OD"
  ],
  "date": [
   "Data wystawienia",
   "Data oferty",
   "Data pokwitowania"
  ],
  "due": [
   "Termin płatności",
   "Ważna do",
   "Data płatności"
  ],
  "balance": [
   "Do zapłaty",
   "Szacowana suma",
   "Zapłacono"
  ],
  "noun": [
   "Faktura",
   "Oferta",
   "Pokwitowanie"
  ],
  "ref": "Numer referencyjny",
  "note": "UWAGI",
  "payment": "DANE DO PRZELEWU",
  "terms": "WARUNKI",
  "payTerms": "Warunki płatności",
  "tax": "Podatek",
  "paid": "Zapłacono",
  "subtotal": "Suma częściowa",
  "discount": "Rabat",
  "shipping": "Wysyłka",
  "total": "Razem",
  "balanceRow": "Do zapłaty",
  "itemTax": "Podatek od pozycji",
  "words": "Słownie",
  "payOnline": "Zapłać online",
  "scan": "Zeskanuj, aby zapłacić",
  "sign": "Podpis osoby upoważnionej",
  "receipt": "Płatne przy odbiorze",
  "net": "{n} dni",
  "cols": {
   "sku": "Kod",
   "description": "Opis",
   "quantity": "Ilość",
   "rate": "Cena",
   "amount": "Wartość",
   "unit": "Jedn."
  },
  "deposit": "Zaliczka do zapłaty",
  "lateFee": "Opłata za zwłokę",
  "method": "Metoda płatności",
  "wmDraft": "SZKIC",
  "wmPaid": "OPŁACONO",
  "wmCopy": "KOPIA"
 },
 "uk": {
  "title": [
   "РАХУНОК",
   "КОШТОРИС",
   "КВИТАНЦІЯ"
  ],
  "bill": [
   "ПЛАТНИК",
   "ПІДГОТОВЛЕНО ДЛЯ",
   "ОТРИМАНО ВІД"
  ],
  "date": [
   "Дата рахунку",
   "Дата кошторису",
   "Дата квитанції"
  ],
  "due": [
   "Термін оплати",
   "Дійсний до",
   "Дата оплати"
  ],
  "balance": [
   "До сплати",
   "Орієнтовна сума",
   "Сплачено"
  ],
  "noun": [
   "Рахунок",
   "Кошторис",
   "Квитанція"
  ],
  "ref": "Номер замовлення",
  "note": "ПРИМІТКА",
  "payment": "РЕКВІЗИТИ ДЛЯ ОПЛАТИ",
  "terms": "УМОВИ",
  "payTerms": "Умови оплати",
  "tax": "Податок",
  "paid": "Сплачено",
  "subtotal": "Проміжний підсумок",
  "discount": "Знижка",
  "shipping": "Доставка",
  "total": "Разом",
  "balanceRow": "До сплати",
  "itemTax": "Податок за позиціями",
  "words": "Сума прописом",
  "payOnline": "Сплатити онлайн",
  "scan": "Скануйте для оплати",
  "sign": "Підпис уповноваженої особи",
  "receipt": "Оплата при отриманні",
  "net": "{n} днів",
  "cols": {
   "sku": "Артикул",
   "description": "Опис",
   "quantity": "К-сть",
   "rate": "Ціна",
   "amount": "Сума",
   "unit": "Од."
  },
  "deposit": "Передоплата до сплати",
  "lateFee": "Пеня за прострочення",
  "method": "Спосіб оплати",
  "wmDraft": "ЧЕРНЕТКА",
  "wmPaid": "ОПЛАЧЕНО",
  "wmCopy": "КОПІЯ"
 },
 "nl": {
  "title": [
   "FACTUUR",
   "OFFERTE",
   "KWITANTIE"
  ],
  "bill": [
   "FACTUUR AAN",
   "OPGESTELD VOOR",
   "ONTVANGEN VAN"
  ],
  "date": [
   "Factuurdatum",
   "Offertedatum",
   "Kwitantiedatum"
  ],
  "due": [
   "Vervaldatum",
   "Geldig tot",
   "Betaaldatum"
  ],
  "balance": [
   "Openstaand bedrag",
   "Geschat totaal",
   "Betaald bedrag"
  ],
  "noun": [
   "Factuur",
   "Offerte",
   "Kwitantie"
  ],
  "ref": "Referentie",
  "note": "OPMERKING",
  "payment": "BETAALGEGEVENS",
  "terms": "VOORWAARDEN",
  "payTerms": "Betalingstermijn",
  "tax": "Belasting",
  "paid": "Betaald",
  "subtotal": "Subtotaal",
  "discount": "Korting",
  "shipping": "Verzendkosten",
  "total": "Totaal",
  "balanceRow": "Openstaand bedrag",
  "itemTax": "Belasting per artikel",
  "words": "Bedrag in woorden",
  "payOnline": "Online betalen",
  "scan": "Scan om te betalen",
  "sign": "Handtekening",
  "receipt": "Betaling bij ontvangst",
  "net": "{n} dagen",
  "cols": {
   "sku": "Code",
   "description": "Omschrijving",
   "quantity": "Aantal",
   "rate": "Prijs",
   "amount": "Bedrag",
   "unit": "Eenheid"
  },
  "deposit": "Nu te betalen aanbetaling",
  "lateFee": "Boete bij te late betaling",
  "method": "Betaalwijze",
  "wmDraft": "CONCEPT",
  "wmPaid": "BETAALD",
  "wmCopy": "KOPIE"
 },
 "ms": {
  "title": [
   "INVOIS",
   "SEBUT HARGA",
   "RESIT"
  ],
  "bill": [
   "DIBILKAN KEPADA",
   "DISEDIAKAN UNTUK",
   "DITERIMA DARIPADA"
  ],
  "date": [
   "Tarikh invois",
   "Tarikh sebut harga",
   "Tarikh resit"
  ],
  "due": [
   "Tarikh akhir bayaran",
   "Sah sehingga",
   "Tarikh bayaran"
  ],
  "balance": [
   "Baki perlu dibayar",
   "Anggaran jumlah",
   "Jumlah dibayar"
  ],
  "noun": [
   "Invois",
   "Sebut harga",
   "Resit"
  ],
  "ref": "Rujukan",
  "note": "NOTA",
  "payment": "MAKLUMAT PEMBAYARAN",
  "terms": "TERMA",
  "payTerms": "Terma pembayaran",
  "tax": "Cukai",
  "paid": "Jumlah dibayar",
  "subtotal": "Jumlah kecil",
  "discount": "Diskaun",
  "shipping": "Penghantaran",
  "total": "Jumlah",
  "balanceRow": "Baki perlu dibayar",
  "itemTax": "Cukai item",
  "words": "Jumlah dalam perkataan",
  "payOnline": "Bayar dalam talian",
  "scan": "Imbas untuk bayar",
  "sign": "Tandatangan sah",
  "receipt": "Bayar semasa terima",
  "net": "{n} hari",
  "cols": {
   "sku": "Kod",
   "description": "Keterangan",
   "quantity": "Kuantiti",
   "rate": "Harga",
   "amount": "Amaun",
   "unit": "Unit"
  },
  "deposit": "Deposit perlu dibayar",
  "lateFee": "Caj lewat",
  "method": "Kaedah pembayaran",
  "wmDraft": "DRAF",
  "wmPaid": "DIBAYAR",
  "wmCopy": "SALINAN"
 },
 "sw": {
  "title": [
   "ANKARA",
   "MAKADIRIO",
   "RISITI"
  ],
  "bill": [
   "ANKARA KWA",
   "IMEANDALIWA KWA",
   "IMEPOKELEWA KUTOKA"
  ],
  "date": [
   "Tarehe ya ankara",
   "Tarehe ya makadirio",
   "Tarehe ya risiti"
  ],
  "due": [
   "Tarehe ya mwisho ya malipo",
   "Halali hadi",
   "Tarehe ya malipo"
  ],
  "balance": [
   "Kiasi kinachodaiwa",
   "Jumla inayokadiriwa",
   "Kiasi kilicholipwa"
  ],
  "noun": [
   "Ankara",
   "Makadirio",
   "Risiti"
  ],
  "ref": "Kumbukumbu",
  "note": "MAELEZO",
  "payment": "TAARIFA ZA MALIPO",
  "terms": "MASHARTI",
  "payTerms": "Masharti ya malipo",
  "tax": "Kodi",
  "paid": "Kilicholipwa",
  "subtotal": "Jumla ndogo",
  "discount": "Punguzo",
  "shipping": "Usafirishaji",
  "total": "Jumla",
  "balanceRow": "Salio linalodaiwa",
  "itemTax": "Kodi ya bidhaa",
  "words": "Kiasi kwa maneno",
  "payOnline": "Lipa mtandaoni",
  "scan": "Changanua ili kulipa",
  "sign": "Sahihi iliyoidhinishwa",
  "receipt": "Lipa unapopokea",
  "net": "Siku {n}",
  "cols": {
   "sku": "Msimbo",
   "description": "Maelezo",
   "quantity": "Idadi",
   "rate": "Bei",
   "amount": "Kiasi",
   "unit": "Kipimo"
  },
  "deposit": "Amana inayodaiwa sasa",
  "lateFee": "Ada ya kuchelewa",
  "method": "Njia ya malipo",
  "wmDraft": "RASIMU",
  "wmPaid": "IMELIPWA",
  "wmCopy": "NAKALA"
 }
};

const IDX = { invoice: 0, estimate: 1, receipt: 2 };
export const isRtlLang = code => (DOC_LANGS.find(l => l[0] === code) || [])[2] === "rtl";
export function labels(code) { return T[code] || T.en; }
// dl("bn", "title", "invoice") → "ইনভয়েস"
export function dl(code, key, type = "invoice") {
  const v = labels(code)[key] ?? T.en[key];
  return Array.isArray(v) ? v[IDX[type] ?? 0] : v;
}
export function colLabel(code, key) { return (labels(code).cols || {})[key] || T.en.cols[key] || key; }
export function netTerms(code, n) { const f = dl(code, "net"); return f.includes("{n}") ? f.replace("{n}", n) : f + " " + n; }
