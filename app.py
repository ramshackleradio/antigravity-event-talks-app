import os
import json
import requests
import xml.etree.ElementTree as ET
from datetime import datetime
from flask import Flask, jsonify, render_template, request
from bs4 import BeautifulSoup

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
CACHE_FILE = "feed_cache.json"

def parse_release_notes_feed(xml_data):
    """
    Parses the Atom XML feed from Google Cloud and breaks it down
    into dates and individual release updates.
    """
    try:
        root = ET.fromstring(xml_data)
    except ET.ParseError as e:
        print(f"XML Parsing Error: {e}")
        return []

    # Atom feed namespace
    namespaces = {'atom': 'http://www.w3.org/2005/Atom'}
    
    entries_data = []
    
    for entry in root.findall('atom:entry', namespaces):
        title_elem = entry.find('atom:title', namespaces)
        date_str = title_elem.text.strip() if title_elem is not None else "Unknown Date"
        
        updated_elem = entry.find('atom:updated', namespaces)
        updated_str = updated_elem.text.strip() if updated_elem is not None else ""
        
        link_elem = entry.find('atom:link[@rel="alternate"]', namespaces)
        if link_elem is None:
            link_elem = entry.find('atom:link', namespaces)
        link_url = link_elem.attrib.get('href', '') if link_elem is not None else ""
        
        content_elem = entry.find('atom:content', namespaces)
        content_html = content_elem.text if content_elem is not None else ""
        
        individual_updates = []
        if content_html:
            soup = BeautifulSoup(content_html, 'html.parser')
            current_type = "Update"
            current_elements = []
            
            # Helper to save current update group
            def save_update(u_type, u_elems, index):
                if not u_elems:
                    return None
                
                # Render content back to HTML string
                html_str = "".join(str(elem) for elem in u_elems).strip()
                # Get clean plain text version for social sharing
                text_str = BeautifulSoup(html_str, 'html.parser').get_text(separator=" ").strip()
                # Replace multiple spaces/newlines
                text_str = " ".join(text_str.split())
                
                safe_date_id = date_str.lower().replace(",", "").replace(" ", "_")
                
                return {
                    "id": f"{safe_date_id}_{index}",
                    "type": u_type,
                    "html": html_str,
                    "text": text_str
                }

            update_index = 0
            for child in soup.children:
                # If child is a NavigableString, we might just ignore or accumulate it
                if child.name == 'h3':
                    # Save the previous accumulated update
                    saved = save_update(current_type, current_elements, update_index)
                    if saved:
                        individual_updates.append(saved)
                        update_index += 1
                    # Start new update
                    current_type = child.get_text().strip()
                    current_elements = []
                elif child.name is not None:
                    current_elements.append(child)
            
            # Save the final update block
            saved = save_update(current_type, current_elements, update_index)
            if saved:
                individual_updates.append(saved)
        
        entries_data.append({
            "date": date_str,
            "updated": updated_str,
            "link": link_url,
            "updates": individual_updates
        })
        
    return entries_data

def get_feed_data(force_refresh=False):
    """
    Retrieves the feed data, either from cache or by fetching live from URL.
    """
    if not force_refresh and os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error reading cache: {e}")
            
    # Fetch live data
    try:
        response = requests.get(FEED_URL, timeout=15)
        response.raise_for_status()
        xml_data = response.content
        
        parsed_data = parse_release_notes_feed(xml_data)
        
        # Save to cache
        if parsed_data:
            with open(CACHE_FILE, 'w') as f:
                json.dump(parsed_data, f, indent=2)
                
        return parsed_data
    except Exception as e:
        print(f"Error fetching live feed: {e}")
        # If live fetch fails, fallback to cache if available
        if os.path.exists(CACHE_FILE):
            with open(CACHE_FILE, 'r') as f:
                return json.load(f)
        return []

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/releases')
def releases():
    refresh = request.args.get('refresh', 'false').lower() == 'true'
    data = get_feed_data(force_refresh=refresh)
    return jsonify({
        "success": True,
        "timestamp": datetime.now().isoformat(),
        "releases": data
    })

if __name__ == '__main__':
    # Initialize cache on start
    get_feed_data(force_refresh=True)
    app.run(host='0.0.0.0', port=5001, debug=True)
