import streamlit as st
import json
import subprocess
import tempfile
import os
import re
from datetime import datetime

st.set_page_config(
    page_title="開発供給実施計画 申請書作成アシスタント",
    page_icon="📋",
    layout="wide",
)

st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&display=swap');
html, body, [class*="css"] { font-family: 'Noto Sans JP', sans-serif; }
.main-header {
    background: linear-gradient(135deg, #1a237e 0%, #283593 50%, #1565c0 100%);
    color: white; padding: 2rem 2.5rem; border-radius: 12px;
    margin-bottom: 2rem; box-shadow: 0 4px 20px rgba(26,35,126,0.3);
}
.main-header h1 { font-size: 1.5rem; font-weight: 700; margin: 0; }
.main-header p  { font-size: 0.88rem; opacity: 0.85; margin: 0.4rem 0 0; }
.progress-bar-wrap { background: #e8eaf6; border-radius: 8px; height: 8px; margin: 1rem 0 0.4rem; }
.progress-bar-fill { background: linear-gradient(90deg, #42a5f5, #1e88e5); border-radius: 8px; height: 8px; }
.chat-user { background: #e3f2fd; border-left: 4px solid #1e88e5; padding: 0.8rem 1rem; border-radius: 0 8px 8px 0; margin: 0.6rem 0; white-space: pre-wrap; }
.chat-ai   { background: #f5f5f5; border-left: 4px solid #78909c; padding: 0.8rem 1rem; border-radius: 0 8px 8px 0; margin: 0.6rem 0; white-space: pre-wrap; }
.section-preview { background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 0.8rem 1rem; margin: 0.4rem 0; font-size: 0.85rem; }
.section-title { font-weight: 700; color: #1a237e; font-size: 0.82rem; margin-bottom: 0.3rem; }
.cbadge { background:#e8f5e9;border:1px solid #a5d6a7;color:#2e7d32;padding:0.15rem 0.6rem;border-radius:20px;font-size:0.72rem;font-weight:600; }
.ibadge { background:#fff3e0;border:1px solid #ffcc80;color:#e65100;padding:0.15rem 0.6rem;border-radius:20px;font-size:0.72rem;font-weight:600; }
.provider-badge { display:inline-block; padding:0.2rem 0.8rem; border-radius:20px; font-size:0.78rem; font-weight:600; margin-left:0.5rem; }
.badge-claude  { background:#e8eaf6; color:#3949ab; border:1px solid #9fa8da; }
.badge-gemini  { background:#e8f5e9; color:#2e7d32; border:1px solid #a5d6a7; }
.badge-openai  { background:#e0f2f1; color:#00695c; border:1px solid #80cbc4; }
.badge-openrouter { background:#fce4ec; color:#c62828; border:1px solid #ef9a9a; }
</style>
""", unsafe_allow_html=True)

# ─── プロバイダー設定 ─────────────────────────────────────────────────────────
PROVIDERS = {
    "Claude (Anthropic)": {
        "id": "claude",
        "badge": "badge-claude",
        "models": [
            "claude-sonnet-4-20250514",
            "claude-opus-4-20250514",
            "claude-haiku-4-5-20251001",
        ],
        "key_placeholder": "sk-ant-...",
        "key_url": "https://console.anthropic.com",
    },
    "Gemini (Google)": {
        "id": "gemini",
        "badge": "badge-gemini",
        "models": [
            "gemini-2.0-flash",
            "gemini-2.5-pro-preview-05-06",
            "gemini-1.5-pro",
        ],
        "key_placeholder": "AIza...",
        "key_url": "https://aistudio.google.com/app/apikey",
    },
    "ChatGPT (OpenAI)": {
        "id": "openai",
        "badge": "badge-openai",
        "models": [
            "gpt-4o",
            "gpt-4o-mini",
            "gpt-4-turbo",
            "o3-mini",
        ],
        "key_placeholder": "sk-...",
        "key_url": "https://platform.openai.com/api-keys",
    },
    "OpenRouter": {
        "id": "openrouter",
        "badge": "badge-openrouter",
        "models": [
            "anthropic/claude-sonnet-4-5",
            "google/gemini-2.0-flash-001",
            "openai/gpt-4o",
            "meta-llama/llama-4-maverick",
            "deepseek/deepseek-chat-v3-0324",
            "mistralai/mistral-large",
        ],
        "key_placeholder": "sk-or-...",
        "key_url": "https://openrouter.ai/keys",
    },
}

# ─── セクション定義 ───────────────────────────────────────────────────────────
SECTIONS = [
    {
        "id": "basic_info",
        "title": "申請者情報（様式第15号）",
        "fields": [
            "氏名又は名称",
            "代表者の氏名",
            "住所又は主たる事務所の所在地",
            "担当者名・連絡先（電話・メール）",
            "業種（日本標準産業分類）",
            "申請日",
        ],
    },
    {
        "id": "project_overview",
        "title": "事業概要（様式第16号 第１章①）",
        "fields": [
            "事業名称",
            "対象営農類型・農作業（水田作／畑作等）",
            "対象品目名",
            "現状・課題・技術ニーズ",
            "開発供給事業の概要",
            "事業期間（実施開始年月～目標年度）",
        ],
    },
    {
        "id": "development_plan",
        "title": "開発段階の取組（様式第16号 第１章（ⅲ））",
        "fields": [
            "開発する技術の内容",
            "生産性向上目標（数値）",
            "目標数値の計算方法・根拠",
            "開発スケジュール（年度・四半期別）",
            "開発体制・人員計画",
        ],
    },
    {
        "id": "supply_plan",
        "title": "供給段階の取組（様式第16号 第１章（ⅳ））",
        "fields": [
            "供給する農業資材又はサービスの内容・供給方法",
            "供給目標数量等",
            "目標数値の根拠",
            "品質面・費用面での優位性",
            "事業の持続性（経済合理性）",
            "農業者への情報提供・継続使用支援措置",
        ],
    },
    {
        "id": "implementation",
        "title": "実施体制（様式第16号 第２章）",
        "fields": [
            "実施体制・役割分担",
            "モニタリング・評価方法",
            "リスクと対応策",
        ],
    },
    {
        "id": "budget",
        "title": "資金計画（別表４）",
        "fields": [
            "総事業費（千円）",
            "設備投資額の内訳（年度別）",
            "運転資金額の内訳（年度別）",
            "資金調達方法（補助金・借入・自己資金等）",
            "収支見通し",
        ],
    },
]

SYSTEM_PROMPT = """あなたは「農林水産省 開発供給実施計画（別記様式第16号）」の申請書作成を支援する専門アドバイザーです。

【申請書の法的根拠】
農業の生産性の向上のためのスマート農業技術の活用の促進に関する法律（令和６年法律第63号）第13条第１項

【収集するセクションとフィールド】
1. 申請者情報：氏名又は名称、代表者氏名、住所、担当者連絡先、業種、申請日
2. 事業概要：事業名称、対象営農類型、対象品目、現状・課題・ニーズ、事業概要、事業期間
3. 開発段階の取組：開発技術の内容、生産性向上目標、計算方法、スケジュール、開発体制
4. 供給段階の取組：供給内容・方法、供給目標、根拠、優位性、持続性、農業者支援措置
5. 実施体制：体制・役割分担、モニタリング・評価、リスクと対応策
6. 資金計画：総事業費、設備投資額、運転資金額、資金調達方法、収支見通し

【応答ルール】
- 農林水産省の公式申請書に記載される文体・用語で整理・提案する
- 回答が曖昧な場合は「営農類型は水田作・畑作などどれに該当しますか」など具体的に深掘りする
- 情報が確定したら必ず以下のタグで出力する（複数可）：
  <DATA>{"section": "セクションID", "field": "フィールド名", "value": "内容"}</DATA>
  セクションIDは basic_info / project_overview / development_plan / supply_plan / implementation / budget のいずれか
- 収集済みの情報は会話履歴を参照し、重複質問しない
"""

INTRO = """こんにちは！**開発供給実施計画 申請書作成アシスタント**です。

農林水産省の公式様式（別記様式第15号・第16号）に準拠したWord文書を、対話形式で作成します。

📋 **収集する情報**
1. 申請者情報（様式第15号）
2. 事業概要・営農類型・対象品目
3. 開発段階の取組内容・生産性向上目標
4. 供給段階の取組内容・供給目標
5. 実施体制・役割分担・リスク管理
6. 資金計画（別表４）

---

まず**申請者（事業者）の名称**を教えてください。
（例：株式会社〇〇、〇〇農業協同組合 など）"""

# ─── セッション初期化 ─────────────────────────────────────────────────────────
def init_session():
    defaults = {
        "messages": [],
        "collected_data": {},
        "provider_name": "Claude (Anthropic)",
        "model": "claude-sonnet-4-20250514",
        "api_keys": {},   # {provider_id: key}
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v

init_session()

# ─── AI呼び出し（マルチプロバイダー） ────────────────────────────────────────
def call_ai(user_message: str) -> str:
    provider_name = st.session_state.provider_name
    prov = PROVIDERS[provider_name]
    pid  = prov["id"]
    model = st.session_state.model
    api_key = st.session_state.api_keys.get(pid, "")

    msgs = [{"role": m["role"], "content": m["content"]} for m in st.session_state.messages]
    msgs.append({"role": "user", "content": user_message})

    if pid == "claude":
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        resp = client.messages.create(
            model=model, max_tokens=2000,
            system=SYSTEM_PROMPT, messages=msgs,
        )
        return resp.content[0].text

    elif pid == "gemini":
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        gmodel = genai.GenerativeModel(
            model_name=model,
            system_instruction=SYSTEM_PROMPT,
        )
        # Gemini はrole="model"を使う
        history = []
        for m in msgs[:-1]:
            role = "model" if m["role"] == "assistant" else "user"
            history.append({"role": role, "parts": [m["content"]]})
        chat = gmodel.start_chat(history=history)
        response = chat.send_message(msgs[-1]["content"])
        return response.text

    elif pid == "openai":
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        openai_msgs = [{"role": "system", "content": SYSTEM_PROMPT}] + msgs
        resp = client.chat.completions.create(
            model=model, max_tokens=2000, messages=openai_msgs,
        )
        return resp.choices[0].message.content

    elif pid == "openrouter":
        from openai import OpenAI
        client = OpenAI(
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
        )
        openai_msgs = [{"role": "system", "content": SYSTEM_PROMPT}] + msgs
        resp = client.chat.completions.create(
            model=model, max_tokens=2000, messages=openai_msgs,
        )
        return resp.choices[0].message.content

    else:
        raise ValueError(f"Unknown provider: {pid}")

# ─── ユーティリティ ───────────────────────────────────────────────────────────
def extract_data_tags(text):
    results = []
    for m in re.finditer(r"<DATA>(.*?)</DATA>", text, re.DOTALL):
        try: results.append(json.loads(m.group(1).strip()))
        except: pass
    return results

def update_collected_data(items):
    for item in items:
        sec, field, value = item.get("section",""), item.get("field",""), item.get("value","")
        if sec and field and value:
            st.session_state.collected_data.setdefault(sec, {})[field] = value

def count_filled():
    total  = sum(len(s["fields"]) for s in SECTIONS)
    filled = sum(len(v) for v in st.session_state.collected_data.values())
    return filled, total

def generate_docx():
    payload = {"created_at": datetime.now().strftime("%Y年%m月%d日"), "sections": st.session_state.collected_data}
    script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "generate_docx.js")
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)
        json_path = f.name
    out_path = json_path.replace(".json", ".docx")
    try:
        result = subprocess.run(["node", script_path, json_path, out_path],
                                capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            raise RuntimeError(result.stderr or result.stdout)
        with open(out_path, "rb") as f:
            return f.read()
    finally:
        for p in [json_path, out_path]:
            if os.path.exists(p): os.unlink(p)

# ─── ヘッダー ─────────────────────────────────────────────────────────────────
filled, total = count_filled()
pct = int(filled / total * 100) if total else 0
prov_cur = PROVIDERS[st.session_state.provider_name]
badge_cls = prov_cur["badge"]

st.markdown(f"""
<div class="main-header">
  <h1>📋 開発供給実施計画 申請書作成アシスタント
    <span class="provider-badge {badge_cls}">{st.session_state.provider_name.split(" ")[0]}</span>
  </h1>
  <p>農林水産省 別記様式第15号・第16号 対応 ／ Word形式で出力</p>
  <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:{pct}%"></div></div>
  <p style="font-size:0.78rem;opacity:0.8;margin-top:0.3rem">入力進捗：{filled} / {total} 項目（{pct}%）</p>
</div>
""", unsafe_allow_html=True)

col_chat, col_preview = st.columns([3, 2], gap="large")

# ─── チャット列 ───────────────────────────────────────────────────────────────
with col_chat:

    # ── AIプロバイダー設定パネル ──────────────────────────────────────────────
    with st.expander("⚙️ AIプロバイダー設定", expanded=not st.session_state.api_keys):
        selected_provider = st.selectbox(
            "使用するAI",
            options=list(PROVIDERS.keys()),
            index=list(PROVIDERS.keys()).index(st.session_state.provider_name),
            key="provider_select",
        )
        prov_info = PROVIDERS[selected_provider]
        pid = prov_info["id"]

        selected_model = st.selectbox(
            "モデル",
            options=prov_info["models"],
            index=0,
            key=f"model_select_{pid}",
        )

        current_key = st.session_state.api_keys.get(pid, "")
        new_key = st.text_input(
            f"APIキー（[取得はこちら]({prov_info['key_url']})）",
            value=current_key,
            type="password",
            placeholder=prov_info["key_placeholder"],
            key=f"key_input_{pid}",
        )

        if st.button("このプロバイダーで使用する", type="primary", use_container_width=True):
            if new_key:
                st.session_state.api_keys[pid] = new_key
            if st.session_state.provider_name != selected_provider or st.session_state.model != selected_model:
                # プロバイダー変更時はチャット履歴をリセット
                st.session_state.messages = []
            st.session_state.provider_name = selected_provider
            st.session_state.model = selected_model
            st.success(f"✓ {selected_provider} / {selected_model} に切り替えました")
            st.rerun()

        # 設定済みプロバイダー一覧
        set_provs = [name for name, p in PROVIDERS.items() if st.session_state.api_keys.get(p["id"])]
        if set_provs:
            st.caption("設定済み: " + " / ".join(set_provs))

    # APIキー未設定チェック
    cur_pid = PROVIDERS[st.session_state.provider_name]["id"]
    if not st.session_state.api_keys.get(cur_pid):
        st.warning("⬆️ 上の設定パネルでAPIキーを入力してください")
        st.stop()

    st.subheader("💬 AIアシスタント")

    if not st.session_state.messages:
        st.session_state.messages.append({"role": "assistant", "content": INTRO})

    chat_box = st.container(height=460)
    with chat_box:
        for msg in st.session_state.messages:
            if msg["role"] == "user":
                st.markdown(f'<div class="chat-user">🧑 {msg["content"]}</div>', unsafe_allow_html=True)
            else:
                display = re.sub(r"<DATA>.*?</DATA>", "", msg["content"], flags=re.DOTALL).strip()
                st.markdown(f'<div class="chat-ai">🤖 {display}</div>', unsafe_allow_html=True)

    with st.form("chat_form", clear_on_submit=True):
        user_input = st.text_area("", height=80, placeholder="回答を入力してください...", label_visibility="collapsed")
        c1, c2 = st.columns([3, 1])
        with c1: submitted = st.form_submit_button("送信 ➤", type="primary", use_container_width=True)
        with c2: reset     = st.form_submit_button("リセット", use_container_width=True)

    if reset:
        st.session_state.messages = []
        st.session_state.collected_data = {}
        st.rerun()

    if submitted and user_input.strip():
        st.session_state.messages.append({"role": "user", "content": user_input})
        with st.spinner(f"{st.session_state.provider_name.split(' ')[0]} が考えています..."):
            try:    reply = call_ai(user_input)
            except Exception as e: reply = f"⚠️ エラー: {e}"
        st.session_state.messages.append({"role": "assistant", "content": reply})
        extracted = extract_data_tags(reply)
        if extracted: update_collected_data(extracted)
        st.rerun()

# ─── プレビュー列 ─────────────────────────────────────────────────────────────
with col_preview:
    st.subheader("📄 申請書プレビュー")

    cd = st.session_state.collected_data
    for sec in SECTIONS:
        sec_data = cd.get(sec["id"], {})
        fc = len(sec_data); tc = len(sec["fields"])
        badge = f'<span class="cbadge">✓ 完了</span>' if fc==tc else f'<span class="ibadge">{fc}/{tc}</span>'
        fields_html = "".join(
            f"<div style='font-size:0.8rem;color:#555;margin:2px 0'>"
            f"<b>{f}</b>：{sec_data.get(f, '<span style=\"color:#bbb\">未入力</span>')}</div>"
            for f in sec["fields"]
        )
        st.markdown(f'<div class="section-preview"><div class="section-title">{sec["title"]} {badge}</div>{fields_html}</div>',
                    unsafe_allow_html=True)

    st.markdown("---")

    if filled > 0:
        if st.button("📥 Word申請書を生成", type="primary", use_container_width=True):
            with st.spinner("Word文書を生成中..."):
                try:
                    docx_bytes = generate_docx()
                    fname = f"開発供給実施計画申請書_{datetime.now().strftime('%Y%m%d')}.docx"
                    st.download_button("⬇️ 申請書.docx をダウンロード", data=docx_bytes,
                                       file_name=fname,
                                       mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                                       use_container_width=True)
                except Exception as e:
                    st.error(f"Word生成エラー: {e}")
    else:
        st.info("対話で情報を入力するとWordダウンロードが可能になります")

    with st.expander("✏️ 直接編集モード"):
        sel = st.selectbox("セクション", [s["title"] for s in SECTIONS], label_visibility="collapsed")
        sec_obj = next(s for s in SECTIONS if s["title"] == sel)
        sid = sec_obj["id"]
        cd.setdefault(sid, {})
        for field in sec_obj["fields"]:
            val     = cd[sid].get(field, "")
            new_val = st.text_area(field, value=val, height=68, key=f"d_{sid}_{field}")
            if new_val != val:
                cd[sid][field] = new_val
