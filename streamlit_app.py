import streamlit as st
import streamlit.components.v1 as components
import os
import json

# Set page config
st.set_page_config(
    page_title="Technodel's Box Manager",
    page_icon="📦",
    layout="wide",
)

# --- DATA PERSISTENCE (Optional for Streamlit) ---
# Note: Streamlit Cloud resets files on reboot. 
# For permanent storage, a database is recommended.
DATA_FILE = "data.json"

def load_data():
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                return f.read()
        except: pass
    return json.dumps({"boxes": {}, "history": [], "totalSold": 0})


# Read files
def get_file_content(filename):
    try:
        if os.path.exists(filename):
            with open(filename, "r", encoding="utf-8") as f:
                return f.read()
    except Exception as e:
        print(f"Error reading {filename}: {e}")
    return ""

def get_bundled_html():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    
    html = get_file_content(os.path.join(current_dir, "index.html"))
    css = get_file_content(os.path.join(current_dir, "index.css"))
    js = get_file_content(os.path.join(current_dir, "app.js"))
    
    if not html:
        return "<h1>Error: could not find index.html</h1>"

    # 1. LOAD THE DATA FROM GITHUB REPO
    repo_data_raw = load_data()
    try:
        repo_data = json.loads(repo_data_raw)
    except:
        repo_data = {"boxes": {}, "history": [], "totalSold": 0}

    # 2. INJECT IT INTO THE HTML
    seed_script = f"""
<script>
  window.__REPO_DATA__ = {json.dumps(repo_data)};
</script>
"""
    if "<head>" in html:
        html = html.replace("<head>", "<head>" + seed_script, 1)
    else:
        html = seed_script + html

    # 3. PATCH APP.JS TO USE THE REPO DATA IF LOCALSTORAGE IS EMPTY
    patched_js = js.replace(
        "// 2. Fallback to LocalStorage",
        """// 1B. Fallback to GitHub repo data if localStorage is empty
    if (window.__REPO_DATA__ && window.__REPO_DATA__.boxes) {
        const lsRaw = localStorage.getItem(STORAGE_KEY);
        if (!lsRaw) {
            state = window.__REPO_DATA__;
            console.log("Loaded from GitHub Repo data");
            renderAll();
            return;
        }
    }
    
    // 2. Fallback to LocalStorage"""
    )
        
    # Inline CSS
    if css:
        html = html.replace('<link rel="stylesheet" href="index.css">', f'<style>{css}</style>')
    
    # Inline patched JS
    if patched_js:
        html = html.replace('<script src="app.js"></script>', f'<script>{patched_js}</script>')
    
    # Remove branding if online (it points to localhost)
    html = html.replace('<script src="http://localhost:3051/branding.js"></script>', '<!-- Branding Disabled -->')
    
    return html

# App Layout
st.markdown("""
<style>
    .stApp > header { display: none; }
    iframe { border: none !important; margin: 0; padding: 0; width: 100%; min-height: 85vh; }
    div.stMarkdown { margin: 0 !important; padding: 0 !important; }
</style>
""", unsafe_allow_html=True)

html_code = get_bundled_html()
components.html(html_code, height=900, scrolling=True)

# Footer info
st.markdown("---")
st.caption("Technodel's Box Manager Pro — Web Version")
st.info("💡 Note: Data is initially loaded from GitHub. Any changes you make are saved in your personal browser session. To update the shared master data, update data.json in GitHub.")
