from flask import Flask, request, jsonify, send_from_directory, Response
import sqlite3, json, os
from datetime import datetime, date, timedelta

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

def init_library_db():
    conn = get_db('library')
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS books (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            title        TEXT    NOT NULL,
            author       TEXT,
            total_pages  INTEGER NOT NULL,
            current_page INTEGER NOT NULL DEFAULT 0,
            cover_url    TEXT,
            status       TEXT    NOT NULL DEFAULT 'want',
            genre        TEXT,
            start_date   TEXT,
            finish_date  TEXT,
            rating       REAL,
            review       TEXT,
            created_at   TEXT    NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
            start_time TEXT    NOT NULL,
            end_time   TEXT    NOT NULL,
            start_page INTEGER,
            end_page   INTEGER,
            pages_read INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS quotes (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
            text       TEXT    NOT NULL,
            page       INTEGER,
            created_at TEXT    NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notes (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
            text       TEXT    NOT NULL,
            page       INTEGER,
            created_at TEXT    NOT NULL
        );
        CREATE TABLE IF NOT EXISTS characters (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
            name        TEXT    NOT NULL,
            description TEXT,
            traits      TEXT
        );
        CREATE TABLE IF NOT EXISTS goals (
            id     INTEGER PRIMARY KEY AUTOINCREMENT,
            type   TEXT    NOT NULL,
            target INTEGER NOT NULL,
            period TEXT
        );
        CREATE TABLE IF NOT EXISTS achievements (
            badge_id    TEXT PRIMARY KEY,
            unlocked_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT
        );
    ''')
    conn.commit()
    conn.close()

# ── Garden routes (unchanged) ─────────────────────────────────────────────────

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

# ── Library static ────────────────────────────────────────────────────────────

@app.route('/library')
@app.route('/library/')
def library_index():
    return send_from_directory('library', 'index.html')

# ── Books ─────────────────────────────────────────────────────────────────────

@app.route('/api/books', methods=['GET'])
def get_books():
    try:
        conn = get_db('library')
        rows = conn.execute('''
            SELECT b.*,
                   COUNT(s.id) AS sessions_count,
                   COALESCE(ROUND(SUM(
                       (JULIANDAY(s.end_time) - JULIANDAY(s.start_time)) * 1440
                   )), 0) AS total_minutes
            FROM books b
            LEFT JOIN sessions s ON s.book_id = b.id
            GROUP BY b.id
            ORDER BY b.created_at DESC
        ''').fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/books/<int:book_id>', methods=['GET'])
def get_book(book_id):
    try:
        conn = get_db('library')
        book = conn.execute('SELECT * FROM books WHERE id = ?', (book_id,)).fetchone()
        if not book:
            conn.close()
            return jsonify({'error': 'Not found'}), 404
        sessions   = conn.execute('SELECT * FROM sessions   WHERE book_id=? ORDER BY start_time DESC', (book_id,)).fetchall()
        quotes     = conn.execute('SELECT * FROM quotes     WHERE book_id=? ORDER BY created_at DESC', (book_id,)).fetchall()
        notes      = conn.execute('SELECT * FROM notes      WHERE book_id=? ORDER BY created_at DESC', (book_id,)).fetchall()
        characters = conn.execute('SELECT * FROM characters WHERE book_id=? ORDER BY name',            (book_id,)).fetchall()
        conn.close()
        return jsonify({**dict(book),
            'sessions':   [dict(r) for r in sessions],
            'quotes':     [dict(r) for r in quotes],
            'notes':      [dict(r) for r in notes],
            'characters': [dict(r) for r in characters],
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/books', methods=['POST'])
def create_book():
    try:
        d = request.get_json()
        if not d.get('title') or not d.get('total_pages'):
            return jsonify({'error': 'title and total_pages required'}), 400
        now = datetime.utcnow().isoformat()
        conn = get_db('library')
        cur = conn.execute('''
            INSERT INTO books (title,author,total_pages,current_page,cover_url,
                               status,genre,start_date,finish_date,rating,review,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        ''', (d['title'], d.get('author'), int(d['total_pages']),
              int(d.get('current_page', 0)), d.get('cover_url'),
              d.get('status','want'), d.get('genre'),
              d.get('start_date'), d.get('finish_date'),
              d.get('rating'), d.get('review'), now))
        conn.commit()
        row = conn.execute('SELECT * FROM books WHERE id=?', (cur.lastrowid,)).fetchone()
        conn.close()
        return jsonify(dict(row)), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/books/<int:book_id>', methods=['PUT'])
def update_book(book_id):
    try:
        d = request.get_json()
        allowed = ['title','author','total_pages','current_page','cover_url',
                   'status','genre','start_date','finish_date','rating','review']
        updates = {k: v for k, v in d.items() if k in allowed}
        conn = get_db('library')
        if updates:
            sets = ', '.join(f'{k}=?' for k in updates)
            conn.execute(f'UPDATE books SET {sets} WHERE id=?',
                         list(updates.values()) + [book_id])
            conn.commit()
        row = conn.execute('SELECT * FROM books WHERE id=?', (book_id,)).fetchone()
        conn.close()
        return jsonify(dict(row))
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/books/<int:book_id>', methods=['DELETE'])
def delete_book(book_id):
    try:
        conn = get_db('library')
        conn.execute('DELETE FROM books WHERE id=?', (book_id,))
        conn.commit()
        conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ── Sessions ──────────────────────────────────────────────────────────────────

@app.route('/api/books/<int:book_id>/sessions', methods=['POST'])
def create_session(book_id):
    try:
        d = request.get_json()
        conn = get_db('library')
        cur = conn.execute('''
            INSERT INTO sessions (book_id,start_time,end_time,start_page,end_page,pages_read)
            VALUES (?,?,?,?,?,?)
        ''', (book_id, d['start_time'], d['end_time'],
              d.get('start_page'), d.get('end_page'), int(d.get('pages_read', 0))))
        if d.get('end_page'):
            conn.execute('UPDATE books SET current_page=MAX(current_page,?) WHERE id=?',
                         (int(d['end_page']), book_id))
        conn.commit()
        row = conn.execute('SELECT * FROM sessions WHERE id=?', (cur.lastrowid,)).fetchone()
        conn.close()
        return jsonify(dict(row)), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sessions/<int:sid>', methods=['DELETE'])
def delete_session(sid):
    try:
        conn = get_db('library')
        conn.execute('DELETE FROM sessions WHERE id=?', (sid,))
        conn.commit()
        conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ── Quotes ────────────────────────────────────────────────────────────────────

@app.route('/api/books/<int:book_id>/quotes', methods=['POST'])
def create_quote(book_id):
    try:
        d = request.get_json()
        now = datetime.utcnow().isoformat()
        conn = get_db('library')
        cur = conn.execute('INSERT INTO quotes (book_id,text,page,created_at) VALUES (?,?,?,?)',
                           (book_id, d['text'], d.get('page'), now))
        conn.commit()
        row = conn.execute('SELECT * FROM quotes WHERE id=?', (cur.lastrowid,)).fetchone()
        conn.close()
        return jsonify(dict(row)), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/quotes/<int:qid>', methods=['DELETE'])
def delete_quote(qid):
    try:
        conn = get_db('library')
        conn.execute('DELETE FROM quotes WHERE id=?', (qid,))
        conn.commit()
        conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ── Notes ─────────────────────────────────────────────────────────────────────

@app.route('/api/books/<int:book_id>/notes', methods=['POST'])
def create_note(book_id):
    try:
        d = request.get_json()
        now = datetime.utcnow().isoformat()
        conn = get_db('library')
        cur = conn.execute('INSERT INTO notes (book_id,text,page,created_at) VALUES (?,?,?,?)',
                           (book_id, d['text'], d.get('page'), now))
        conn.commit()
        row = conn.execute('SELECT * FROM notes WHERE id=?', (cur.lastrowid,)).fetchone()
        conn.close()
        return jsonify(dict(row)), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/notes/<int:nid>', methods=['DELETE'])
def delete_note(nid):
    try:
        conn = get_db('library')
        conn.execute('DELETE FROM notes WHERE id=?', (nid,))
        conn.commit()
        conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ── Characters ────────────────────────────────────────────────────────────────

@app.route('/api/books/<int:book_id>/characters', methods=['POST'])
def create_character(book_id):
    try:
        d = request.get_json()
        conn = get_db('library')
        cur = conn.execute(
            'INSERT INTO characters (book_id,name,description,traits) VALUES (?,?,?,?)',
            (book_id, d['name'], d.get('description'), d.get('traits')))
        conn.commit()
        row = conn.execute('SELECT * FROM characters WHERE id=?', (cur.lastrowid,)).fetchone()
        conn.close()
        return jsonify(dict(row)), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/characters/<int:cid>', methods=['PUT'])
def update_character(cid):
    try:
        d = request.get_json()
        conn = get_db('library')
        conn.execute('UPDATE characters SET name=?,description=?,traits=? WHERE id=?',
                     (d.get('name'), d.get('description'), d.get('traits'), cid))
        conn.commit()
        row = conn.execute('SELECT * FROM characters WHERE id=?', (cid,)).fetchone()
        conn.close()
        return jsonify(dict(row))
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/characters/<int:cid>', methods=['DELETE'])
def delete_character(cid):
    try:
        conn = get_db('library')
        conn.execute('DELETE FROM characters WHERE id=?', (cid,))
        conn.commit()
        conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ── Goals ─────────────────────────────────────────────────────────────────────

@app.route('/api/goals', methods=['GET'])
def get_goals():
    try:
        conn = get_db('library')
        rows = conn.execute('SELECT * FROM goals').fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/goals', methods=['POST'])
def create_goal():
    try:
        d = request.get_json()
        conn = get_db('library')
        cur = conn.execute('INSERT INTO goals (type,target,period) VALUES (?,?,?)',
                           (d['type'], int(d['target']), d.get('period')))
        conn.commit()
        row = conn.execute('SELECT * FROM goals WHERE id=?', (cur.lastrowid,)).fetchone()
        conn.close()
        return jsonify(dict(row)), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/goals/<int:gid>', methods=['PUT'])
def update_goal(gid):
    try:
        d = request.get_json()
        conn = get_db('library')
        conn.execute('UPDATE goals SET type=?,target=?,period=? WHERE id=?',
                     (d['type'], int(d['target']), d.get('period'), gid))
        conn.commit()
        row = conn.execute('SELECT * FROM goals WHERE id=?', (gid,)).fetchone()
        conn.close()
        return jsonify(dict(row))
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/goals/<int:gid>', methods=['DELETE'])
def delete_goal(gid):
    try:
        conn = get_db('library')
        conn.execute('DELETE FROM goals WHERE id=?', (gid,))
        conn.commit()
        conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ── Achievements ──────────────────────────────────────────────────────────────

@app.route('/api/achievements', methods=['GET'])
def get_achievements():
    try:
        conn = get_db('library')
        rows = conn.execute('SELECT * FROM achievements').fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/achievements', methods=['POST'])
def unlock_achievement():
    try:
        d = request.get_json()
        now = datetime.utcnow().isoformat()
        conn = get_db('library')
        conn.execute('INSERT OR IGNORE INTO achievements (badge_id,unlocked_at) VALUES (?,?)',
                     (d['badge_id'], now))
        conn.commit()
        conn.close()
        return jsonify({'ok': True}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ── Settings ──────────────────────────────────────────────────────────────────

@app.route('/api/settings', methods=['GET'])
def get_settings():
    try:
        conn = get_db('library')
        rows = conn.execute('SELECT * FROM settings').fetchall()
        conn.close()
        return jsonify({r['key']: r['value'] for r in rows})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/settings', methods=['PUT'])
def update_settings():
    try:
        d = request.get_json()
        conn = get_db('library')
        for k, v in d.items():
            conn.execute('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)', (k, str(v)))
        conn.commit()
        conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ── Statistics ────────────────────────────────────────────────────────────────

def calc_streaks(conn):
    rows = conn.execute(
        "SELECT DISTINCT DATE(start_time) AS d FROM sessions ORDER BY d"
    ).fetchall()
    days = [r['d'] for r in rows]
    if not days:
        return 0, 0

    best = cur_run = 1
    for i in range(1, len(days)):
        gap = (date.fromisoformat(days[i]) - date.fromisoformat(days[i-1])).days
        if gap == 1:
            cur_run += 1
            best = max(best, cur_run)
        else:
            cur_run = 1

    day_set = set(days)
    today = date.today()
    cur_streak = 0
    check = today
    while check.isoformat() in day_set:
        cur_streak += 1
        check -= timedelta(days=1)
    if cur_streak == 0:
        check = today - timedelta(days=1)
        while check.isoformat() in day_set:
            cur_streak += 1
            check -= timedelta(days=1)

    return cur_streak, best

@app.route('/api/stats', methods=['GET'])
def get_stats():
    try:
        period = request.args.get('period', 'all')
        conn   = get_db('library')
        today  = date.today()

        if   period == 'week':  since = (today - timedelta(days=6)).isoformat()
        elif period == 'month': since = today.replace(day=1).isoformat()
        elif period == 'year':  since = today.replace(month=1, day=1).isoformat()
        else:                   since = None

        df = 'AND DATE(start_time) >= ?' if since else ''
        p  = [since] if since else []

        mins_per_day = conn.execute(f'''
            SELECT DATE(start_time) AS day,
                   ROUND(SUM((JULIANDAY(end_time)-JULIANDAY(start_time))*1440)) AS minutes
            FROM sessions WHERE 1=1 {df} GROUP BY day ORDER BY day
        ''', p).fetchall()

        pages_per_day = conn.execute(f'''
            SELECT DATE(start_time) AS day, SUM(pages_read) AS pages
            FROM sessions WHERE 1=1 {df} GROUP BY day ORDER BY day
        ''', p).fetchall()

        books_per_month = conn.execute('''
            SELECT strftime('%m', finish_date) AS month, COUNT(*) AS count
            FROM books WHERE status='finished' AND finish_date LIKE ?
            GROUP BY month ORDER BY month
        ''', (f'{today.year}-%',)).fetchall()

        genre_dist = conn.execute('''
            SELECT COALESCE(genre,'Unknown') AS genre, COUNT(*) AS count
            FROM books GROUP BY genre ORDER BY count DESC
        ''').fetchall()

        speed_per_week = conn.execute(f'''
            SELECT strftime('%Y-W%W', start_time) AS week,
                   CASE WHEN SUM((JULIANDAY(end_time)-JULIANDAY(start_time))*60) > 0
                        THEN ROUND(SUM(pages_read)/SUM((JULIANDAY(end_time)-JULIANDAY(start_time))*24), 1)
                        ELSE 0 END AS pages_per_hour
            FROM sessions WHERE 1=1 {df} GROUP BY week ORDER BY week
        ''', p).fetchall()

        totals = conn.execute(f'''
            SELECT
                (SELECT COUNT(*) FROM books WHERE status='finished') AS books_finished,
                COALESCE(SUM(pages_read), 0) AS total_pages,
                COALESCE(ROUND(SUM((JULIANDAY(end_time)-JULIANDAY(start_time))*1440)), 0) AS total_minutes
            FROM sessions WHERE 1=1 {df}
        ''', p).fetchone()

        speed_row = conn.execute('''
            SELECT CASE WHEN SUM((JULIANDAY(end_time)-JULIANDAY(start_time))*60) > 0
                        THEN ROUND(SUM(pages_read)/SUM((JULIANDAY(end_time)-JULIANDAY(start_time))*24), 1)
                        ELSE 0 END AS avg_speed
            FROM sessions
        ''').fetchone()

        cur_streak, best_streak = calc_streaks(conn)
        conn.close()

        return jsonify({
            'mins_per_day':    [dict(r) for r in mins_per_day],
            'pages_per_day':   [dict(r) for r in pages_per_day],
            'books_per_month': [dict(r) for r in books_per_month],
            'genre_dist':      [dict(r) for r in genre_dist],
            'speed_per_week':  [dict(r) for r in speed_per_week],
            'totals': {
                'books_finished': int(totals['books_finished'] or 0),
                'total_pages':    int(totals['total_pages'] or 0),
                'total_minutes':  int(totals['total_minutes'] or 0),
                'avg_speed':      float(speed_row['avg_speed'] or 0),
                'cur_streak':     cur_streak,
                'best_streak':    best_streak,
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ── Export / Import ───────────────────────────────────────────────────────────

@app.route('/api/export', methods=['GET'])
def export_data():
    try:
        conn = get_db('library')
        out  = {}
        for t in ['books','sessions','quotes','notes','characters','goals','achievements','settings']:
            rows = conn.execute(f'SELECT * FROM {t}').fetchall()
            out[t] = [dict(r) for r in rows]
        conn.close()
        return Response(json.dumps(out, indent=2), mimetype='application/json',
                        headers={'Content-Disposition': 'attachment; filename=library-backup.json'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/import', methods=['POST'])
def import_data():
    conn = None
    try:
        payload = request.get_json()
        mode    = payload.get('mode', 'overwrite')
        data    = payload.get('data', {})
        conn    = get_db('library')
        conn.execute('BEGIN')
        if mode == 'overwrite':
            for t in ['characters','notes','quotes','sessions','books','goals','achievements','settings']:
                conn.execute(f'DELETE FROM {t}')
        # books first (parent)
        for row in data.get('books', []):
            r = {k: v for k, v in row.items() if k != 'id'}
            cols = ','.join(r); phs = ','.join('?' for _ in r)
            conn.execute(f'INSERT OR IGNORE INTO books ({cols}) VALUES ({phs})', list(r.values()))
        # children
        for t in ['sessions','quotes','notes','characters','goals']:
            for row in data.get(t, []):
                r = {k: v for k, v in row.items() if k != 'id'}
                cols = ','.join(r); phs = ','.join('?' for _ in r)
                conn.execute(f'INSERT OR IGNORE INTO {t} ({cols}) VALUES ({phs})', list(r.values()))
        for row in data.get('achievements', []):
            conn.execute('INSERT OR IGNORE INTO achievements (badge_id,unlocked_at) VALUES (?,?)',
                         (row['badge_id'], row['unlocked_at']))
        for row in data.get('settings', []):
            conn.execute('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)',
                         (row['key'], row['value']))
        conn.execute('COMMIT')
        conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        try:
            conn.execute('ROLLBACK')
            conn.close()
        except Exception:
            pass
        return jsonify({'error': str(e)}), 500

# ── Boot ──────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    init_garden_db()
    init_library_db()
    app.run(debug=True)
