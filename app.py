from flask import Flask, request, jsonify, send_from_directory
import sqlite3, json

app = Flask(__name__, static_folder='.', static_url_path='')

# ── DB helpers ────────────────────────────────────────────────────────────────

def get_db(name='garden'):
    conn = sqlite3.connect(f'{name}.db')
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn

def init_garden_db():
    conn = get_db('garden')
    conn.execute('''CREATE TABLE IF NOT EXISTS state (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )''')
    conn.commit()
    conn.close()

# ── Garden routes ─────────────────────────────────────────────────────────────

@app.route('/')
def garden_index():
    return send_from_directory('.', 'index.html')

@app.route('/api/state', methods=['GET'])
def get_state():
    conn = get_db('garden')
    row = conn.execute('SELECT value FROM state WHERE key = "garden"').fetchone()
    conn.close()
    if row:
        return jsonify(json.loads(row['value']))
    return jsonify(None)

@app.route('/api/state', methods=['POST'])
def save_state():
    data = request.get_json()
    conn = get_db('garden')
    conn.execute('INSERT OR REPLACE INTO state (key, value) VALUES ("garden", ?)',
                 (json.dumps(data),))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# ── Boot ──────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    init_garden_db()
    app.run(debug=True)
