from flask import Flask, request, jsonify, send_from_directory
import sqlite3, json, os

app = Flask(__name__, static_folder='.', static_url_path='')

DB = 'garden.db'

def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS state (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

# Отдаём index.html по корневому адресу
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

# Браузер запрашивает данные при загрузке
@app.route('/api/state', methods=['GET'])
def get_state():
    conn = get_db()
    row = conn.execute('SELECT value FROM state WHERE key = "garden"').fetchone()
    conn.close()
    if row:
        return jsonify(json.loads(row['value']))
    return jsonify(None)  # первый запуск — данных ещё нет

# Браузер отправляет данные после каждой сессии
@app.route('/api/state', methods=['POST'])
def save_state():
    data = request.get_json()
    conn = get_db()
    conn.execute(
        'INSERT OR REPLACE INTO state (key, value) VALUES ("garden", ?)',
        (json.dumps(data),)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

if __name__ == '__main__':
    init_db()
    app.run(debug=True)