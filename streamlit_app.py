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

def save_data(data_str):
    try:
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            f.write(data_str)
    except: pass

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
            
    # Inline CSS
    if css:
        html = html.replace('<link rel="stylesheet" href="index.css">', f'<style>{css}</style>')
    
    # Inline JS
    if js:
        html = html.replace('<script src="app.js"></script>', f'<script>{js}</script>')
    
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
st.info("💡 Note: This version saves storage locally in your browser. For shared group access, use the Windows desktop server.")
