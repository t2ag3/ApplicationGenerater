const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  VerticalAlign, Footer, Header, TabStopType, LevelFormat,
  PageBreak, PageOrientation
} = require("docx");
const fs = require("fs");

const inputPath = process.argv[2];
const outputPath = process.argv[3];
if (!inputPath || !outputPath) { process.exit(1); }

const data = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
const cd = data.sections || {};

// ─── 定数 ────────────────────────────────────────────────────────────────────
const TABLE_W = 9026; // A4 content (1440*8.27" - 2*1440*0.98")
const COL1 = 2200;
const COL2 = TABLE_W - COL1;

const bSingle = (color="000000", sz=4) => ({ style: BorderStyle.SINGLE, size: sz, color });
const bNone   = () => ({ style: BorderStyle.NONE, size: 0, color: "FFFFFF" });
const allBorders = (c="000000") => ({ top: bSingle(c), bottom: bSingle(c), left: bSingle(c), right: bSingle(c) });
const noB = () => ({ top: bNone(), bottom: bNone(), left: bNone(), right: bNone() });

function run(text, opts={}) {
  return new TextRun({ text, font: "ＭＳ 明朝", size: 20, ...opts });
}
function para(children, opts={}) {
  if (typeof children === "string") children = [run(children)];
  return new Paragraph({ children, spacing: { line: 360, lineRule: "exact" }, ...opts });
}
function emptyPara() {
  return new Paragraph({ children: [new TextRun("")], spacing: { after: 0 } });
}

// ─── セル生成ヘルパー ─────────────────────────────────────────────────────────
function cell(children, opts={}) {
  const { w = TABLE_W, shade = "FFFFFF", borders: b = allBorders(), vAlign = VerticalAlign.TOP, span } = opts;
  if (typeof children === "string") children = [para(children)];
  const c = new TableCell({
    width: { size: w, type: WidthType.DXA },
    shading: { fill: shade, type: ShadingType.CLEAR },
    borders: b,
    verticalAlign: vAlign,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children,
  });
  return c;
}

function headerCell(text, w=TABLE_W) {
  return cell([para(text, { alignment: AlignmentType.LEFT })], { w, shade: "D9D9D9", borders: allBorders() });
}

// ─── フルワイドのラベル行 + 値行テーブルを作る ─────────────────────────────
function fieldTable(rows) {
  // rows: [{label, value}]
  return new Table({
    width: { size: TABLE_W, type: WidthType.DXA },
    columnWidths: [COL1, COL2],
    rows: rows.map(({label, value}) =>
      new TableRow({ children: [
        cell([para(label, { alignment: AlignmentType.LEFT })], { w: COL1, shade: "F2F2F2", borders: allBorders() }),
        cell([para(value || "")], { w: COL2, borders: allBorders() }),
      ]})
    )
  });
}

function wideTable(rows) {
  // rows: [string] – each row is full-width cell
  return new Table({
    width: { size: TABLE_W, type: WidthType.DXA },
    columnWidths: [TABLE_W],
    rows: rows.map(content => new TableRow({ children: [
      cell(typeof content === "string" ? [para(content)] : content,
           { w: TABLE_W, borders: allBorders() })
    ]}))
  });
}

function sectionTitle(text) {
  return para([run(text, { bold: true, size: 22 })], {
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 1 } },
    spacing: { before: 240, after: 120, line: 360, lineRule: "exact" }
  });
}

function subTitle(text) {
  return para([run(text, { bold: true })], { spacing: { before: 160, after: 80, line: 360, lineRule: "exact" } });
}

// ─── 入力データ取り出し ────────────────────────────────────────────────────────
function v(sectionId, field) {
  return (cd[sectionId] || {})[field] || "";
}

// ─── 本文生成 ─────────────────────────────────────────────────────────────────
const children = [];

// ========== 別記様式第15号 ==========
children.push(para([run("別記様式第15号（法第13条第１項関係）", { size: 20 })]));
children.push(emptyPara());
children.push(para([run("開発供給実施計画に係る認定申請書", { size: 24, bold: true })],
  { alignment: AlignmentType.CENTER, spacing: { line: 360, lineRule: "exact" } }));
children.push(emptyPara());

// 日付・宛先
children.push(para([
  run("　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　"),
  run(v("basic_info","申請日") || "　　　年　　月　　日"),
]));
children.push(emptyPara());
children.push(para([run("　農林水産大臣　殿")]));
children.push(emptyPara());
children.push(para([run("申請者")]));

// 申請者情報
const applicant = v("basic_info","事業者名");
const addr      = v("basic_info","所在地");
const rep       = v("basic_info","代表者名");
const contact   = v("basic_info","担当者名・連絡先");

children.push(new Table({
  width: { size: TABLE_W, type: WidthType.DXA },
  columnWidths: [TABLE_W],
  rows: [new TableRow({ children: [cell([
    para([run("①氏名又は名称："), run(applicant)]),
    para([run("　（法人その他の団体の場合はその代表者の氏名："), run(rep), run("　　　）")]),
    para([run("②住所又は主たる事務所の所在地："), run(addr)]),
    para([run("③連絡先　・電話番号："), run("")]),
    para([run("　　　　　・E-mailアドレス：")]),
    para([run("　　　　　・担当者名："), run(contact)]),
    para([run("④業種：")]),
  ], { w: TABLE_W, borders: allBorders() })]})],
}));

children.push(emptyPara());
children.push(para([run("　農業の生産性の向上のためのスマート農業技術の活用の促進に関する法律（令和６年法律第63号）第13条第１項の規定に基づき、別記の計画について認定を受けたいので、申請します。")],
  { spacing: { line: 360, lineRule: "exact" } }));

children.push(emptyPara());
children.push(para([run("（提出する書面の目録）")], { spacing: { before: 120, line: 360, lineRule: "exact" } }));
const checklist = [
  "□　別記様式第16号　開発供給実施計画",
  "□　（別表１）合併等の措置の内容",
  "□　（別表２）合併等の措置に伴う施設の撤去又は設備の廃棄の種類",
  "□　（別表３）合併等の措置に伴う不動産の譲渡、取得又は譲受けの内容",
  "□　（別表４）開発供給事業に必要な資金の額及びその調達方法",
  "□　（別表５）特例措置の活用に関する事項",
  "□　（別表６）開発供給事業の用に供する設備等の導入に関する事項",
  "□　（別表７）航空法の特例（法第15条関係）の適用に係る無人航空機の飛行に関する事項",
  "□　（別表８）研究開発設備等の種類その他の当該研究開発設備等の利用の内容に関する事項",
  "□　（別表９）スマート農業技術活用促進資金の貸付けに関する資金計画等",
  "□　（別表10）農業競争力強化支援法第24条の特例措置の申請（法第19条関係）",
];
checklist.forEach(t => children.push(para([run(t)], { spacing: { line: 300, lineRule: "exact" } })));
children.push(para([run("注：提出する書類にチェック（レ）を付けること。")], { spacing: { before: 60, line: 300, lineRule: "exact" } }));

// ページ区切り
children.push(new Paragraph({ children: [new PageBreak()], spacing: { line: 240 } }));

// ========== 別記様式第16号 ==========
children.push(para([run("別記様式第16号（法第13条関係）")]));
children.push(emptyPara());
children.push(para([run("開発供給実施計画", { size: 24, bold: true })],
  { alignment: AlignmentType.CENTER, spacing: { line: 360, lineRule: "exact" } }));
children.push(emptyPara());

// ─ 第１章 開発供給事業の内容 ─
children.push(sectionTitle("１　開発供給事業の内容"));

// （１）申請者の概要
children.push(subTitle("（１）申請者の概要"));
children.push(new Table({
  width: { size: TABLE_W, type: WidthType.DXA },
  columnWidths: [TABLE_W],
  rows: [
    new TableRow({ children: [headerCell("申請者（代表者）")] }),
    new TableRow({ children: [cell([
      para([run("①氏名又は名称："), run(applicant)]),
      para([run("　（法人その他の団体の場合はその代表者の氏名："), run(rep), run("　　　）")]),
      para([run("②住所又は主たる事務所の所在地："), run(addr)]),
      para([run("③連絡先　・電話番号：")]),
      para([run("　　　　　・E-mailアドレス：")]),
      para([run("　　　　　・担当者名："), run(contact)]),
      para([run("④業種：")]),
    ], { w: TABLE_W, borders: allBorders() })] }),
  ],
}));
children.push(emptyPara());

// （２）開発供給事業の内容
children.push(subTitle("（２）開発供給事業の内容"));
children.push(para([run("　①　開発供給事業の促進の目標の該当項目（営農類型等・農作業、対象品目）")]));

const projectOverview = v("project_overview","事業の目的・背景");
const targetArea      = v("project_overview","対象地域");
const projectName     = v("project_overview","事業名称");
const supplyContent   = v("supply_plan","供給品目・サービス内容");
const devContent      = v("development_plan","開発内容・技術仕様");
const devSchedule     = v("development_plan","開発スケジュール");
const riskMgmt        = v("risk_management","想定リスクと対応策");

children.push(wideTable([[
  para([run("【営農類型等・農作業】")]),
  para([run("□ 水田作　□ 畑作　□ 露地野菜・花き作　□ 施設野菜・花き作")]),
  para([run("□ 果樹・茶作　□ 畜産・酪農　□ 農作業共通")]),
  para([run("（品目名："), run(targetArea ? targetArea : "　　　　　　　　　　　　　　"), run("　　　　　　　　　）")]),
].flat()]));
children.push(emptyPara());

// 実施内容
children.push(para([run("　　実施内容")]));
children.push(para([run("（ⅰ）対象とする営農類型・農作業分野における現状・課題、技術ニーズ")]));
children.push(wideTable([projectOverview || ""]));
children.push(emptyPara());

children.push(para([run("（ⅱ）開発供給事業の概要")]));
children.push(wideTable([projectName ? `事業名称：${projectName}\n\n${supplyContent || ""}` : ""]));
children.push(emptyPara());

children.push(para([run("（ⅲ）開発供給事業のうち開発段階の取組内容")]));
children.push(wideTable([[
  para([run("ア　本計画で開発する技術の内容")]),
  para([run(devContent || "")]),
  para([run("イ　本計画で開発する技術による生産性向上の目標")]),
  para([run("　ⅰ　生産性向上目標")]),
  para([run("")]),
  para([run("　ⅱ　ⅰの数値の計算方法（生産現場の環境条件等を含む）")]),
  para([run("")]),
  para([run("　ⅲ　目標の達成が困難な場合、その理由及び目標の達成に向けた追加的な取組条件")]),
  para([run("")]),
]]));
children.push(emptyPara());

children.push(para([run("（ⅳ）開発供給事業のうち供給段階の取組内容")]));
const supplyVol    = v("supply_plan","供給量・規模");
const supplyMethod = v("supply_plan","供給方法・体制");
const qualityMgmt  = v("supply_plan","品質管理方針");
children.push(wideTable([[
  para([run("ア　供給する農業資材又はスマート農業技術活用サービスの内容及び供給方法")]),
  para([run(supplyContent ? `${supplyContent}　${supplyMethod || ""}` : "")]),
  para([run("イ　供給に関する目標")]),
  para([run("　ⅰ　農業者等に対する販売又は提供の数量等に係る目標")]),
  para([run(supplyVol || "")]),
  para([run("　ⅱ　ⅰの数値の根拠")]),
  para([run("")]),
  para([run("ウ　供給に係る優位性及び事業の継続性")]),
  para([run("　ⅰ　供給する農業資材又はスマート農業技術活用サービスの品質面・費用面での優位性")]),
  para([run(qualityMgmt || "")]),
  para([run("　ⅱ　事業の持続性（経済合理性）")]),
  para([run("")]),
  para([run("エ　農業者に対する費用・効果等の情報提供及び農業者等が継続して適切に当該農業資材を使用できるようにするための措置")]),
  para([run("")]),
  para([run("オ　アの供給に係る技術に適合した生産方式の内容等を明確にするための措置")]),
  para([run("")]),
]]));

// ─ 第２章 実施期間及び実施体制 ─
children.push(sectionTitle("２　開発供給事業の実施期間及び実施体制"));
children.push(subTitle("（１）開発供給事業の実施期間"));
children.push(para([run("①実施期間")]));

const period = v("project_overview","事業期間");
children.push(new Table({
  width: { size: TABLE_W, type: WidthType.DXA },
  columnWidths: [TABLE_W],
  rows: [
    new TableRow({ children: [cell([para([run("実施期間："), run(period || "　　年　　　月 ～　　　　　年　　　月（目標年度）")])], { w: TABLE_W, borders: allBorders() })] }),
    new TableRow({ children: [cell([para([run("（うち供給の実施期間：　　　年　　月　～　　年　　月）")])], { w: TABLE_W, borders: allBorders() })] }),
  ],
}));
children.push(emptyPara());
children.push(para([run("　具体的なスケジュール")]));
children.push(wideTable([devSchedule || ""]));
children.push(emptyPara());

children.push(subTitle("（２）開発供給事業の実施体制"));
const structure = v("risk_management","実施体制・ガバナンス");
children.push(wideTable([structure || ""]));

// ─ 第３章 合併等 ─
children.push(sectionTitle("３　開発供給事業の効率的な実施のために行う会社の合併等の措置の有無"));
children.push(para([run("（１）実施予定の有無")]));
children.push(para([run("　　　□ 実施予定あり")]));

// ─ 第４章 資金 ─
children.push(sectionTitle("４　開発供給事業に必要な資金の額及びその調達方法"));
children.push(para([run("別表４に記載すること。")]));

// ─ 第５章 設備 ─
children.push(sectionTitle("５　開発供給事業の用に供する設備等の導入等に関する事項"));
children.push(para([run("別表６に記載すること。")]));

// ─ 第６章 特例措置 ─
children.push(sectionTitle("６　特例措置の活用に関する事項"));
children.push(para([run("別表５に記載すること。")]));

// ─ 第７章 確認事項 ─
children.push(sectionTitle("７　確認事項"));
const confirmItems = [
  "開発供給事業の実施に当たっては、「農業機械の自動走行に関する安全性確保ガイドライン」等を踏まえた農作業の安全性対策に努めること",
  "計画内に、技術上又は営農上の有用な情報等の保護すべき知的財産がある場合には、「農業分野における営業秘密の保護ガイドライン」等を踏まえた対策に努めること",
  "開発供給事業の実施にあたり、農業に由来する環境への負荷の低減に配慮していること",
  "地方公共団体その他の関係者との連携を図ること等により、当該開発供給事業に関係する各種施策との調和して行っていること",
  "特例を活用する場合に、関係機関に対し本計画の内容を、農林水産省から提供することに同意していること",
];
children.push(new Table({
  width: { size: TABLE_W, type: WidthType.DXA },
  columnWidths: [400, TABLE_W - 400],
  rows: confirmItems.map(item => new TableRow({ children: [
    cell([para("□")], { w: 400, borders: allBorders() }),
    cell([para(item)], { w: TABLE_W - 400, borders: allBorders() }),
  ]}))
}));

children.push(emptyPara());
children.push(para([run("（添付書類）")]));
const attachments = [
  "□　申請者が法人である場合には、申請者ごとの定款又はこれに代わる書面",
  "□　申請者が法人でない団体である場合には、規約その他当該団体の組織及び運営に関する定めを記載した書類",
  "□　申請者の最近二期間の事業報告書、貸借対照表及び損益計算書",
  "□　開発供給事業の実施に必要な行政庁の許認可等が必要な場合、当該許認可等を受けていることを証する書類又はその許認可等の申請状況を明らかにした書類",
];
attachments.forEach(t => children.push(para([run(t)], { spacing: { line: 300, lineRule: "exact" } })));

// ─ 別表４ ─
children.push(new Paragraph({ children: [new PageBreak()], spacing: { line: 240 } }));
children.push(para([run("（別表４）")], { spacing: { before: 240, line: 360, lineRule: "exact" } }));
children.push(emptyPara());
children.push(para([run("開発供給事業に必要な資金の額及びその調達方法", { bold: true, size: 22 })],
  { alignment: AlignmentType.CENTER, spacing: { line: 360, lineRule: "exact" } }));
children.push(emptyPara());
children.push(para([run(`申請者の氏名又は名称：${applicant}`)]));

const budgetTotal    = v("budget","総事業費");
const budgetBreakdown = v("budget","費用内訳（開発費・設備費・運営費）");
const fundingMethod  = v("budget","資金調達方法");
const forecast       = v("budget","収支見通し");

const yearCols = 5;
const yearW = Math.floor((TABLE_W - 2400) / yearCols);
const labelW = 2400;

children.push(new Table({
  width: { size: TABLE_W, type: WidthType.DXA },
  columnWidths: [labelW, ...Array(yearCols).fill(yearW)],
  rows: [
    new TableRow({ children: [
      headerCell("", labelW),
      ...Array.from({length: yearCols}, (_, i) =>
        new TableCell({
          width: { size: yearW, type: WidthType.DXA },
          borders: allBorders(),
          shading: { fill: "D9D9D9", type: ShadingType.CLEAR },
          margins: { top: 60, bottom: 60, left: 60, right: 60 },
          children: [para([run(`○年度\n(　年　月期)`)], { alignment: AlignmentType.CENTER })]
        })
      )
    ]}),
    ...[
      { label: "①設備投資額", val: "" },
      { label: "②運転資金額", val: "" },
      { label: "③資金調達額合計\n（①＋②）", val: "" },
    ].map(row => new TableRow({ children: [
      cell([para(row.label)], { w: labelW, shade: "F2F2F2", borders: allBorders() }),
      ...Array(yearCols).fill(null).map(() => cell([""], { w: yearW, borders: allBorders() }))
    ]})),
    new TableRow({ children: [
      cell([
        para("資金調達内訳"),
        para("　補助金・委託費等"),
        para("　金融機関借入"),
        para("　自己資金"),
        para("　その他"),
      ], { w: labelW, shade: "F2F2F2", borders: allBorders() }),
      ...Array(yearCols).fill(null).map(() => cell([
        para(fundingMethod || ""),
      ], { w: yearW, borders: allBorders() }))
    ]}),
  ]
}));
children.push(para([run("（単位：千円）　総事業費："), run(budgetTotal || ""), run("　　収支見通し："), run(forecast || "")],
  { spacing: { before: 60, line: 300, lineRule: "exact" } }));
children.push(para([run("費用内訳："), run(budgetBreakdown || "")],
  { spacing: { line: 300, lineRule: "exact" } }));

// ─── ドキュメント組み立て ─────────────────────────────────────────────────────
const doc = new Document({
  styles: {
    default: { document: { run: { font: "ＭＳ 明朝", size: 20 } } },
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 }
      }
    },
    children,
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outputPath, buf);
  console.log("OK:" + outputPath);
}).catch(e => {
  console.error("ERROR:" + e.message);
  process.exit(1);
});
