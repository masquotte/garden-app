// ── STATE ──────────────────────────────────────────────────────────────────
let books = [], achievements = []
let selectedBookId = null
let sessionTarget = 25          // minutes
let sessionBookId = null
let sessionStart  = null        // Date.now() when current run began
let elapsedBefore = 0           // ms accumulated before current run
let sessionInterval = null
let isPaused = false
let statsOpen = true, statsPeriod = 'week'
let editingBookId = null
let pendingCoverFile = null

const RING_CIRC = 471   // 2π * 75
const DIAL_CIRC = 490   // 2π * 78

const BADGES = [
  { id: 'first_session', emoji: '📖', name: 'First Chapter',  desc: 'Complete your first reading session' },
  { id: 'five_sessions', emoji: '📚', name: 'Bookworm',       desc: 'Complete 5 reading sessions' },
  { id: 'first_finish',  emoji: '🎉', name: 'The End',        desc: 'Finish your first book' },
  { id: 'five_finish',   emoji: '🏆', name: 'Avid Reader',    desc: 'Finish 5 books' },
  { id: 'ten_books',     emoji: '🏛️', name: 'Librarian',      desc: 'Have 10 books in your library' },
  { id: 'streak_3',      emoji: '🔥', name: '3-Day Streak',   desc: 'Read 3 days in a row' },
  { id: 'streak_7',      emoji: '⚡', name: 'Week Streak',    desc: 'Read 7 days in a row' },
]

// ── HELPERS ──────────────────────────────────────────────────────────────────
function el(id) { return document.getElementById(id) }

function getToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function pct(cur, total) {
  if (!total) return 0
  return Math.min(100, Math.round((cur / total) * 100))
}

function fmtMins(m) {
  if (!m) return '0 min'
  if (m < 60) return `${Math.round(m)} min`
  return `${Math.floor(m/60)}h ${Math.round(m%60)}m`
}

function fmtMs(ms) {
  const secs = Math.floor(ms / 1000)
  const m = Math.floor(secs / 60), s = secs % 60
  return `${m}:${String(s).padStart(2,'0')}`
}

function toast(msg) {
  const t = el('toast')
  t.textContent = msg
  t.classList.remove('hidden')
  clearTimeout(t._t)
  t._t = setTimeout(() => t.classList.add('hidden'), 2600)
}

function bookBaseColor(book) {
  const colors = { reading: '#1a5fa0', want: '#5a7090', finished: '#c08030' }
  return colors[book.status] || '#5a7090'
}

// ── API ───────────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const r = await fetch(path, opts)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

// ── BOOK SELECTION / DIAL ─────────────────────────────────────────────────────
function selectBook(id) {
  selectedBookId = id
  renderDialSvg()
  renderRecentBooks()
}

function onDialClick() {
  if (!selectedBookId) openLibList()
}

function renderDialSvg() {
  const book = books.find(b => b.id === selectedBookId)
  const p = book ? pct(book.current_page, book.total_pages) : 0
  const offset = DIAL_CIRC * (1 - p / 100)

  el('dialProgressArc').style.strokeDashoffset = offset

  if (book && book.cover_url) {
    el('dialCoverImg').setAttribute('href', book.cover_url)
    el('dialCoverImg').style.display = ''
    el('dialEmoji').style.display = 'none'
  } else {
    el('dialCoverImg').style.display = 'none'
    el('dialEmoji').style.display = ''
  }

  el('dialPct').textContent = book ? `${p}%  ·  p.${book.current_page} / ${book.total_pages}` : ''
  el('dialTitle').textContent = book ? book.title : 'choose a book'
}

function renderRecentBooks() {
  const reading = books.filter(b => b.status === 'reading').slice(0, 5)
  const c = el('recentBooks')

  if (!reading.length) {
    c.innerHTML = '<div class="empty-hint">No books in progress. <span class="link" onclick="openAddBook()">Add one?</span></div>'
    c.onclick = null
    return
  }

  c.innerHTML = reading.map(b => {
    const p = pct(b.current_page, b.total_pages)
    const sel = selectedBookId === b.id ? ' selected' : ''
    const thumbStyle = b.cover_url
      ? `background-image:url('${b.cover_url}');background-size:cover;background-position:center`
      : `background:${bookBaseColor(b)};display:flex;align-items:center;justify-content:center`
    return `<div class="recent-book-card${sel}" data-bid="${b.id}">
      <div class="recent-book-thumb" style="${thumbStyle}">
        ${!b.cover_url ? '<span class="thumb-emoji">📖</span>' : ''}
      </div>
      <div class="recent-book-info">
        <div class="recent-book-title">${b.title}</div>
        <div class="recent-book-pct">${p}% · p.${b.current_page}</div>
      </div>
    </div>`
  }).join('')

  c.onclick = e => {
    const card = e.target.closest('[data-bid]')
    if (card) selectBook(parseInt(card.dataset.bid))
  }
}

// ── AMBIENT EFFECTS ───────────────────────────────────────────────────────────
function buildStarsHTML() {
  const stars = [
    {s:5,t:'8%', l:'5%', a:'twinkle1',d:'0s',   dur:'5.2s'},
    {s:7,t:'28%',l:'14%',a:'twinkle2',d:'-3s',  dur:'8.4s'},
    {s:4,t:'16%',l:'22%',a:'twinkle3',d:'-6s',  dur:'7.2s'},
    {s:5,t:'5%', l:'32%',a:'twinkle1',d:'-1.5s',dur:'6.1s'},
    {s:7,t:'22%',l:'44%',a:'twinkle2',d:'-5s',  dur:'9.1s'},
    {s:4,t:'35%',l:'36%',a:'twinkle3',d:'-8s',  dur:'6.4s'},
    {s:5,t:'12%',l:'58%',a:'twinkle1',d:'-2.5s',dur:'7.4s'},
    {s:4,t:'32%',l:'68%',a:'twinkle3',d:'-4s',  dur:'5.8s'},
    {s:7,t:'6%', l:'74%',a:'twinkle2',d:'-7s',  dur:'8.7s'},
    {s:4,t:'20%',l:'82%',a:'twinkle3',d:'-0.5s',dur:'6.8s'},
    {s:5,t:'38%',l:'90%',a:'twinkle1',d:'-3.5s',dur:'5.2s'},
    {s:7,t:'10%',l:'96%',a:'twinkle2',d:'-9s',  dur:'9.8s'},
  ]
  return stars.map(({s,t,l,a,d,dur}) => {
    const h = s/2, i = s*0.18
    const pts = [h+',0',`${h+i},${h-i}`,s+','+h,`${h+i},${h+i}`,h+','+s,`${h-i},${h+i}`,'0,'+h,`${h-i},${h-i}`].join(' ')
    return `<svg style="position:absolute;top:${t};left:${l};width:${s}px;height:${s}px;animation:${a} ${dur} ease-in-out infinite;animation-delay:${d};overflow:visible" viewBox="0 0 ${s} ${s}" xmlns="http://www.w3.org/2000/svg"><polygon points="${pts}" fill="rgba(255,224,100,0.9)"/></svg>`
  }).join('')
}

function renderEffect() {
  const layer = el('effectLayer')
  if (!layer) return
  const landKey = localStorage.getItem('lib_land') || 'grass'
  const land    = (typeof LANDS !== 'undefined') && LANDS[landKey]
  if (!land) { layer.innerHTML = ''; return }
  const isDark = document.body.classList.contains('dark')
  const type   = isDark ? land.effect.dark : land.effect.light

  if (type === 'clouds') {
    layer.innerHTML = `
<div class="cloud" style="width:90px;height:26px;top:18%;animation:drift1 38s linear infinite">
  <div style="position:absolute;border-radius:50%;background:rgba(255,255,255,0.62);width:40px;height:40px;top:-18px;left:14px"></div>
  <div style="position:absolute;border-radius:50%;background:rgba(255,255,255,0.62);width:28px;height:28px;top:-12px;left:42px"></div>
</div>
<div class="cloud" style="width:70px;height:20px;top:8%;animation:drift2 52s linear infinite;animation-delay:-18s">
  <div style="position:absolute;border-radius:50%;background:rgba(255,255,255,0.62);width:32px;height:32px;top:-14px;left:10px"></div>
  <div style="position:absolute;border-radius:50%;background:rgba(255,255,255,0.62);width:22px;height:22px;top:-9px;left:32px"></div>
</div>
<div class="cloud" style="width:110px;height:28px;top:30%;animation:drift3 44s linear infinite;animation-delay:-30s">
  <div style="position:absolute;border-radius:50%;background:rgba(255,255,255,0.62);width:46px;height:46px;top:-22px;left:18px"></div>
  <div style="position:absolute;border-radius:50%;background:rgba(255,255,255,0.62);width:34px;height:34px;top:-15px;left:52px"></div>
</div>`
  } else if (type === 'stars') {
    layer.innerHTML = buildStarsHTML()
  } else if (type === 'snow' || type === 'snow-dark') {
    const flakes = [
      {s:3,l:'5%', dur:'14.7s',d:'0s',    drift:'12px'}, {s:2,l:'12%',dur:'18.9s',d:'-2s',  drift:'-8px'},
      {s:4,l:'20%',dur:'12.6s',d:'-4s',   drift:'16px'}, {s:2,l:'28%',dur:'23.1s',d:'-1s',  drift:'-14px'},
      {s:3,l:'35%',dur:'16.8s',d:'-6s',   drift:'10px'}, {s:5,l:'42%',dur:'15.8s',d:'-3s',  drift:'-6px'},
      {s:2,l:'50%',dur:'21s',  d:'-5s',   drift:'18px'}, {s:3,l:'57%',dur:'13.7s',d:'-1.5s',drift:'-10px'},
      {s:4,l:'64%',dur:'18.9s',d:'-7s',   drift:'8px'},  {s:2,l:'70%',dur:'14.7s',d:'-2.5s',drift:'-16px'},
      {s:3,l:'76%',dur:'23.1s',d:'-4.5s', drift:'12px'}, {s:2,l:'82%',dur:'16.8s',d:'-0.5s',drift:'-4px'},
      {s:4,l:'88%',dur:'12.6s',d:'-3.5s', drift:'14px'}, {s:3,l:'93%',dur:'20s',  d:'-6.5s',drift:'-12px'},
    ]
    const snowHTML = flakes.map(({s,l,dur,d,drift}) =>
      `<div class="snowflake" style="width:${s}px;height:${s}px;left:${l};top:-${s}px;--drift:${drift};animation:snowfall ${dur} linear infinite;animation-delay:${d}"></div>`
    ).join('')
    layer.innerHTML = (type === 'snow-dark') ? buildStarsHTML() + snowHTML : snowHTML
  } else {
    layer.innerHTML = ''
  }
}

// ── LAND PICKER ───────────────────────────────────────────────────────────────
const LAND_EMOJI = { grass: '🌿', snow: '❄️' }

function openLandPicker() {
  el('landOverlay').classList.remove('hidden')
  renderLandGrid()
}

function renderLandGrid() {
  const active = localStorage.getItem('lib_land') || 'grass'
  if (typeof LANDS === 'undefined') return
  el('landGrid').innerHTML = Object.entries(LANDS).map(([key, land]) => {
    const isActive = key === active
    return `<div class="land-card${isActive ? ' active' : ''}" onclick="selectLand('${key}')">
      <div style="font-size:1.8rem;margin-bottom:6px">${LAND_EMOJI[key] || '🌄'}</div>
      <div style="font-size:0.85rem;font-weight:600">${land.name}</div>
      ${isActive ? '<div style="font-size:0.7rem;color:var(--blue);margin-top:3px">Active</div>' : ''}
    </div>`
  }).join('')
}

function selectLand(key) {
  localStorage.setItem('lib_land', key)
  renderEffect()
  renderLandGrid()
}

// ── BOOKSHELF SVG ─────────────────────────────────────────────────────────────
function buildShelfSVG() {
  const W = 460, ML = 20, MR = 20
  const SHELF_W   = W - ML - MR
  const BOOK_AREA = 88
  const PLANK_H   = 13
  const GAP       = 10
  const UNIT      = BOOK_AREA + PLANK_H + GAP
  const SHELF_Y   = [10, 10 + UNIT, 10 + UNIT * 2]
  const H         = 10 + UNIT * 3 - GAP + 6

  const sorted = [...books].sort((a, b) => {
    const o = { reading: 0, want: 1, finished: 2 }
    return (o[a.status] ?? 3) - (o[b.status] ?? 3)
  })

  // Books with a real cover_url always face out; every 4th book (id%4===0) also faces out
  function isCover(book) { return !!(book.cover_url) || (book.id % 4 === 0) }
  function bookW(book) {
    return isCover(book)
      ? Math.max(50, Math.min(58, Math.round((book.total_pages || 200) / 7)))
      : Math.max(14, Math.min(20, Math.round((book.total_pages || 200) / 25)))
  }
  function bookH(book) { return BOOK_AREA - (book.id % 4) * 4 }

  const AVAIL = SHELF_W - 26
  const shelves = [[], [], []]
  let si = 0, used = 0
  for (const book of sorted.slice(0, 60)) {
    const w = bookW(book) + 2
    if (si < 2 && used + w > AVAIL) { si++; used = 0 }
    if (si > 2) break
    shelves[si].push(book)
    used += w
  }

  // Pre-calculate positions so clipPath coords are correct
  const pos = new Map()
  shelves.forEach((shelfBks, si_) => {
    const totalW = shelfBks.reduce((s, b) => s + bookW(b) + 2, 0) - 2
    let cx = ML + 13 + Math.max(0, (AVAIL - totalW) / 2)
    shelfBks.forEach(book => {
      const w = bookW(book), h = bookH(book)
      pos.set(book.id, { x: cx, y: SHELF_Y[si_] + BOOK_AREA - h, w, h, cover: isCover(book) })
      cx += w + 2
    })
  })

  const SP = {  // spine palettes
    reading:  ['#1a5fa0','#2570b8','#1c568e','#2a65a8'],
    want:     ['#5a7090','#6a8098','#506080','#70889a'],
    finished: ['#c08030','#b07020','#d09040','#a86c28'],
  }
  const CP = {  // cover palettes (slightly brighter)
    reading:  ['#2a78c8','#3585d8','#2268b0','#3a80cc'],
    want:     ['#8090b0','#9aaec8','#6a8098','#a0b8d0'],
    finished: ['#d09040','#c08030','#e0a050','#b87020'],
  }

  const parts = [`<svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`]
  const defs  = ['<defs>']
  pos.forEach(({x, y, w, h, cover}, bookId) => {
    defs.push(`<clipPath id="bcp${bookId}"><rect x="${x.toFixed(1)}" y="${y}" width="${w}" height="${h}" rx="${cover ? 3 : 2}"/></clipPath>`)
  })
  defs.push('</defs>')
  parts.push(defs.join(''))

  parts.push(`<rect x="8" y="6" width="${W-16}" height="${H-10}" rx="10" fill="var(--shelf-bg)"/>`)

  shelves.forEach((shelfBks, si_) => {
    const sy = SHELF_Y[si_], plankY = sy + BOOK_AREA
    parts.push(`<rect x="${ML}" y="${plankY}" width="${SHELF_W}" height="${PLANK_H}" rx="2" class="shelf-plank"/>`)
    parts.push(`<rect x="${ML}" y="${plankY+PLANK_H}" width="${SHELF_W}" height="3" rx="1" class="shelf-shadow"/>`)
    parts.push(`<rect x="${ML}" y="${sy}" width="13" height="${BOOK_AREA+PLANK_H}" rx="2" class="shelf-bookend"/>`)
    parts.push(`<rect x="${W-MR-13}" y="${sy}" width="13" height="${BOOK_AREA+PLANK_H}" rx="2" class="shelf-bookend"/>`)

    if (!shelfBks.length) {
      if (si_ === 0 && !books.length)
        parts.push(`<text x="${W/2}" y="${sy+BOOK_AREA/2+5}" text-anchor="middle" fill="var(--muted)" font-size="10" font-family="Nunito,sans-serif" opacity="0.6">Add books to fill your shelves</text>`)
      return
    }

    shelfBks.forEach((book, bi) => {
      const {x: cx, y: by, w, h, cover} = pos.get(book.id)
      const xS = cx.toFixed(1)

      if (cover) {
        const color = (CP[book.status] || CP.want)[bi % 4]
        // drop shadow
        parts.push(`<rect x="${(cx+2).toFixed(1)}" y="${by+3}" width="${w}" height="${h}" rx="3" fill="rgba(0,0,0,0.22)"/>`)
        // face
        parts.push(`<rect x="${xS}" y="${by}" width="${w}" height="${h}" rx="3" fill="${color}"/>`)
        if (book.cover_url) {
          parts.push(`<image href="${book.cover_url}" x="${xS}" y="${by}" width="${w}" height="${h}" clip-path="url(#bcp${book.id})" preserveAspectRatio="xMidYMid slice"/>`)
        } else {
          const short = book.title.length > 9 ? book.title.slice(0,8)+'…' : book.title
          parts.push(`<text x="${(cx+w/2).toFixed(1)}" y="${by+h/2-4}" text-anchor="middle" fill="rgba(255,255,255,0.92)" font-size="6.5" font-family="Nunito,sans-serif" font-weight="700">${short}</text>`)
          if (book.author) {
            const auth = book.author.split(' ').pop().slice(0,9)
            parts.push(`<text x="${(cx+w/2).toFixed(1)}" y="${by+h/2+9}" text-anchor="middle" fill="rgba(255,255,255,0.6)" font-size="5.5" font-family="Nunito,sans-serif">${auth}</text>`)
          }
        }
        // left binding shadow
        parts.push(`<rect x="${xS}" y="${by}" width="5" height="${h}" fill="rgba(0,0,0,0.20)" rx="3"/>`)
        // bottom title bar (only when image present)
        if (book.cover_url) {
          const short = book.title.length > 10 ? book.title.slice(0,9)+'…' : book.title
          parts.push(`<rect x="${xS}" y="${by+h-17}" width="${w}" height="17" fill="rgba(0,0,0,0.46)" rx="0 0 3 3"/>`)
          parts.push(`<text x="${(cx+w/2).toFixed(1)}" y="${by+h-5}" text-anchor="middle" fill="rgba(255,255,255,0.92)" font-size="6" font-family="Nunito,sans-serif" font-weight="700">${short}</text>`)
        }
        parts.push(`<rect x="${xS}" y="${by}" width="${w}" height="${h}" rx="3" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="1"/>`)

      } else {
        const color = (SP[book.status] || SP.want)[bi % 4]
        parts.push(`<rect x="${(cx+1.5).toFixed(1)}" y="${by+2}" width="${w}" height="${h}" rx="2" fill="rgba(0,0,0,0.16)"/>`)
        parts.push(`<rect x="${xS}" y="${by}" width="${w}" height="${h}" rx="2" fill="${color}"/>`)
        parts.push(`<rect x="${xS}" y="${by}" width="2.5" height="${h}" rx="1" fill="rgba(255,255,255,0.22)"/>`)
        const short = book.title.length > 13 ? book.title.slice(0,12)+'…' : book.title
        const mx = (cx+w/2).toFixed(1), my = (by+h/2).toFixed(1)
        parts.push(`<text transform="rotate(-90,${mx},${my})" x="${mx}" y="${my}" text-anchor="middle" dominant-baseline="middle" fill="rgba(255,255,255,0.82)" font-size="5.5" font-family="Nunito,sans-serif" font-weight="700">${short}</text>`)
      }

      // click zone always on top
      parts.push(`<rect x="${xS}" y="${by}" width="${w}" height="${h}" fill="transparent" class="sh-book" data-id="${book.id}"/>`)
    })
  })

  if (books.length > 36)
    parts.push(`<text x="${W/2}" y="${H-4}" text-anchor="middle" fill="var(--muted)" font-size="8.5" font-family="Nunito,sans-serif" opacity="0.7">+ ${books.length - 36} more in All Books</text>`)

  parts.push('</svg>')
  return parts.join('\n')
}

function renderShelf() {
  el('shelfGrid').innerHTML = buildShelfSVG()

  el('shelfGrid').onclick = e => {
    const t = e.target.closest('[data-id]')
    if (t) openBookDetail(parseInt(t.dataset.id))
  }

  const reading  = books.filter(b => b.status === 'reading').length
  const finished = books.filter(b => b.status === 'finished').length
  el('shelfSubtitle').textContent = books.length
    ? `${reading} reading · ${finished} finished · ${books.length} total` : ''
  el('bookCountDisplay').textContent = books.length
}

// ── TIMER ─────────────────────────────────────────────────────────────────────
function startSession() {
  if (!selectedBookId) { toast('Choose a book first'); return }
  sessionBookId = selectedBookId
  sessionStart  = Date.now()
  elapsedBefore = 0
  isPaused      = false

  document.body.classList.add('lib-running')

  const book = books.find(b => b.id === sessionBookId)
  el('runningBookTitle').textContent = book?.title || ''
  el('pauseBtn').textContent = '⏸ Take a break'
  el('pauseBtn').classList.remove('paused')
  el('ringProgress').style.strokeDashoffset = 0

  updateCountdown()
  sessionInterval = setInterval(updateCountdown, 500)
}

function pauseSession() {
  if (isPaused) {
    sessionStart = Date.now()
    isPaused = false
    el('pauseBtn').textContent = '⏸ Take a break'
    el('pauseBtn').classList.remove('paused')
    sessionInterval = setInterval(updateCountdown, 500)
  } else {
    elapsedBefore += Date.now() - sessionStart
    clearInterval(sessionInterval)
    sessionInterval = null
    isPaused = true
    el('pauseBtn').textContent = '▶ Resume'
    el('pauseBtn').classList.add('paused')
  }
}

function stopSession() {
  clearInterval(sessionInterval)
  sessionInterval = null
  const elapsed = elapsedBefore + (isPaused ? 0 : Date.now() - sessionStart)
  document.body.classList.remove('lib-running')
  isPaused = false
  showStopOverlay(elapsed)
}

function updateCountdown() {
  const elapsed  = elapsedBefore + (Date.now() - sessionStart)
  const remaining = Math.max(0, sessionTarget * 60000 - elapsed)
  const fraction  = Math.min(1, elapsed / (sessionTarget * 60000))

  el('countdown').textContent = fmtMs(remaining)
  el('ringProgress').style.strokeDashoffset = RING_CIRC * fraction

  if (remaining <= 0) {
    clearInterval(sessionInterval)
    sessionInterval = null
    stopSession()
  }
}

// ── STOP SESSION OVERLAY ─────────────────────────────────────────────────────
function showStopOverlay(elapsedMs) {
  const mins = Math.round(elapsedMs / 60000)
  el('stopSummary').textContent = `You read for ${fmtMins(mins)} 🎉`
  const book = books.find(b => b.id === sessionBookId)
  el('stopPageInput').value = ''
  el('stopPageInput').placeholder = `Current: p.${book?.current_page || 0}`
  el('stopOverlay').classList.remove('hidden')

  el('stopSave').onclick = async () => {
    const endPage  = parseInt(el('stopPageInput').value) || null
    const startPage = book?.current_page || 0
    const pagesRead = endPage ? Math.max(0, endPage - startPage) : 0
    const now       = new Date().toISOString()
    const startTime = new Date(Date.now() - elapsedMs).toISOString()
    try {
      await api('POST', `/api/books/${sessionBookId}/sessions`, {
        start_time: startTime, end_time: now,
        start_page: startPage || undefined,
        end_page:   endPage   || undefined,
        pages_read: pagesRead,
      })
      el('stopOverlay').classList.add('hidden')
      toast('Session saved! 📖')
      await loadAll()
      renderShelf()
      renderSetup()
      await checkAchievements()
      await loadAndRenderStats()
    } catch(e) { toast('Error saving session') }
  }

  el('stopDiscard').onclick = () => el('stopOverlay').classList.add('hidden')
}

// ── LOAD & RENDER ─────────────────────────────────────────────────────────────
async function loadAll() {
  const [bks, achs] = await Promise.all([
    api('GET', '/api/books'),
    api('GET', '/api/achievements'),
  ])
  books        = bks  || []
  achievements = achs || []
}

function renderSetup() {
  renderDialSvg()
  renderRecentBooks()
  renderShelf()
}

// ── STATS ─────────────────────────────────────────────────────────────────────
function toggleStats() {
  statsOpen = !statsOpen
  el('statsCollapsible').style.display = statsOpen ? '' : 'none'
  el('statsToggleArrow').style.transform = statsOpen ? '' : 'rotate(180deg)'
}

function switchStatsPeriod(p) {
  statsPeriod = p
  document.querySelectorAll('.stats-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.period === p))
  loadAndRenderStats()
}

async function loadAndRenderStats() {
  try {
    const data = await api('GET', `/api/stats?period=${statsPeriod}`)
    renderStats(data)
  } catch(e) {
    el('statsContent').innerHTML = '<div class="empty-hint">No stats yet.</div>'
  }
}

function renderStats(data) {
  const t = data.totals || {}
  el('statsStreak').textContent = t.cur_streak ? `🔥 ${t.cur_streak}-day streak` : ''

  const cards = [
    { label: 'Books finished', value: t.books_finished ?? 0,     icon: '📚' },
    { label: 'Pages read',     value: (t.total_pages ?? 0).toLocaleString(), icon: '📄' },
    { label: 'Time read',      value: fmtMins(t.total_minutes ?? 0), icon: '⏱' },
    { label: 'Reading speed',  value: `${t.avg_speed ?? 0} p/h`, icon: '⚡' },
  ]

  let html = `<div class="stats-cards">${cards.map(c =>
    `<div class="stats-card">
       <div class="stats-card-icon">${c.icon}</div>
       <div class="stats-card-val">${c.value}</div>
       <div class="stats-card-lbl">${c.label}</div>
     </div>`).join('')}</div>`

  if (data.mins_per_day?.length) html += buildBarChart(data.mins_per_day, 'minutes', 'Minutes per day')
  if (data.genre_dist?.length)   html += buildGenreChart(data.genre_dist)

  el('statsContent').innerHTML = html
}

function buildBarChart(rows, key, title) {
  const vals   = rows.map(r => r[key] || 0)
  const maxV   = Math.max(...vals, 1)
  const W = 460, H = 90, PAD = 24, BAR_H = 56
  const bw     = Math.min(32, Math.max(4, (W - PAD*2) / rows.length - 2))
  const spacing = (W - PAD*2) / (rows.length || 1)

  const bars = rows.map((r, i) => {
    const v  = r[key] || 0
    const bh = (v / maxV) * BAR_H
    const x  = PAD + i * spacing
    const y  = H - PAD - bh
    const lbl = rows.length <= 14 ? (r.day?.slice(5) || '') : ''
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="var(--blue)" opacity="0.8"/>
      ${lbl ? `<text x="${(x+bw/2).toFixed(1)}" y="${H-8}" text-anchor="middle" font-size="6" fill="var(--muted)" font-family="Nunito,sans-serif">${lbl}</text>` : ''}`
  }).join('')

  return `<div class="stats-chart-wrap">
    <div class="stats-chart-title">${title}</div>
    <svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>
  </div>`
}

function buildGenreChart(genres) {
  const total = genres.reduce((s, g) => s + g.count, 0) || 1
  return `<div class="stats-chart-wrap">
    <div class="stats-chart-title">Genres</div>
    <div class="genre-list">${genres.slice(0, 6).map(g =>
      `<div class="genre-row">
         <span class="genre-name">${g.genre}</span>
         <div class="genre-bar-wrap"><div class="genre-bar" style="width:${(g.count/total*100).toFixed(1)}%"></div></div>
         <span class="genre-count">${g.count}</span>
       </div>`).join('')}</div>
  </div>`
}

// ── LIBRARY LIST POPUP ────────────────────────────────────────────────────────
function openLibList() {
  el('libListOverlay').classList.remove('hidden')
  renderLibList()
}
function closeLibList() { el('libListOverlay').classList.add('hidden') }

function renderLibList() {
  const activeTab = el('libFilterTabs').querySelector('.active')
  const filter    = activeTab ? activeTab.dataset.status : 'all'
  const search    = (el('libSearch').value || '').toLowerCase()

  let filtered = filter === 'all' ? books : books.filter(b => b.status === filter)
  if (search) filtered = filtered.filter(b =>
    b.title.toLowerCase().includes(search) || (b.author || '').toLowerCase().includes(search))

  el('libListContent').innerHTML = filtered.length
    ? filtered.map(renderBookCard).join('')
    : '<div class="empty-hint">No books found.</div>'

  el('libListContent').onclick = e => {
    const editBtn = e.target.closest('.book-card-edit')
    if (editBtn) {
      e.stopPropagation()
      openAddBook(books.find(b => b.id === parseInt(editBtn.dataset.id)))
      return
    }
    const card = e.target.closest('[data-book]')
    if (card) { closeLibList(); openBookDetail(parseInt(card.dataset.book)) }
  }
}

function renderBookCard(b) {
  const p = pct(b.current_page, b.total_pages)
  const coverStyle = b.cover_url
    ? `background-image:url('${b.cover_url}');background-size:cover;background-position:center`
    : `background:${bookBaseColor(b)};display:flex;align-items:center;justify-content:center`
  const statusLabel = { reading: 'Reading', want: 'Want', finished: 'Finished' }[b.status] || b.status

  return `<div class="book-card" data-book="${b.id}">
    <div class="book-card-cover" style="${coverStyle}">
      ${!b.cover_url ? '<span style="font-size:22px">📖</span>' : ''}
    </div>
    <div class="book-card-body">
      <div class="book-card-title">${b.title}</div>
      <div class="book-card-author">${b.author || ''}</div>
      <div class="book-card-status ${b.status}">${statusLabel}</div>
      ${b.status !== 'want' ? `<div class="book-card-progress"><div class="progress-fill" style="width:${p}%"></div></div>` : ''}
    </div>
    <button class="book-card-edit" data-id="${b.id}" title="Edit">✏️</button>
  </div>`
}

// ── BOOK DETAIL POPUP ─────────────────────────────────────────────────────────
async function openBookDetail(id) {
  try {
    const book = await api('GET', `/api/books/${id}`)
    renderBookDetail(book)
    el('bookDetailOverlay').classList.remove('hidden')
    el('detailEditBtn').onclick = () => {
      closeBookDetail()
      openAddBook(books.find(b => b.id === id) || book)
    }
  } catch(e) { toast('Error loading book') }
}

function closeBookDetail() { el('bookDetailOverlay').classList.add('hidden') }

function renderBookDetail(book) {
  const p = pct(book.current_page, book.total_pages)
  const coverHtml = book.cover_url
    ? `<img class="detail-cover-img" src="${book.cover_url}" alt="cover">`
    : `<div class="detail-cover-placeholder"><span style="font-size:40px">📖</span></div>`

  const stars = [1,2,3,4,5].map(s =>
    `<span class="star${(book.rating||0) >= s ? ' lit' : ''}" onclick="rateBook(${book.id},${s})">★</span>`
  ).join('')

  el('bookDetailContent').innerHTML = `
    <div class="detail-hero">
      <div class="detail-cover">${coverHtml}</div>
      <div class="detail-meta">
        <div class="detail-title">${book.title}</div>
        ${book.author ? `<div class="detail-author">${book.author}</div>` : ''}
        ${book.genre  ? `<div class="detail-genre">${book.genre}</div>`  : ''}
        <div class="progress-bar"><div class="progress-fill" style="width:${p}%"></div></div>
        <div class="detail-progress-text">${book.current_page} / ${book.total_pages} pages · ${p}%</div>
        <div class="star-rating">${stars}</div>
        <div class="detail-actions">
          ${book.status !== 'reading'  ? `<button class="btn-sm btn-blue" onclick="setBookStatus(${book.id},'reading')">📖 Start reading</button>` : ''}
          ${book.status === 'reading'  ? `<button class="btn-sm btn-blue" onclick="setBookStatus(${book.id},'finished')">✓ Mark finished</button>` : ''}
          <button class="btn-sm" style="background:rgba(180,60,60,0.1);border:1px solid rgba(180,60,60,0.3);color:var(--danger)" onclick="confirmDeleteBook(${book.id})">🗑️ Delete</button>
        </div>
      </div>
    </div>
    <div class="detail-tabs">
      <button class="dtab active" data-tab="sessions">Sessions (${book.sessions?.length||0})</button>
      <button class="dtab" data-tab="quotes">Quotes (${book.quotes?.length||0})</button>
      <button class="dtab" data-tab="notes">Notes (${book.notes?.length||0})</button>
    </div>
    <div id="detailTabContent" class="detail-tab-content"></div>`

  // Store book data on the element for tab renders
  el('bookDetailContent')._bookData = book

  el('bookDetailContent').querySelectorAll('.dtab').forEach(btn => {
    btn.onclick = () => {
      el('bookDetailContent').querySelectorAll('.dtab').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      renderDetailTab(btn.dataset.tab, el('bookDetailContent')._bookData)
    }
  })
  renderDetailTab('sessions', book)
}

function renderDetailTab(tab, book) {
  const c = el('detailTabContent')
  if (tab === 'sessions') {
    const items = book.sessions || []
    c.innerHTML = (items.length
      ? items.map(s => {
          const mins = Math.round((new Date(s.end_time) - new Date(s.start_time)) / 60000)
          const pages = s.pages_read ? `+${s.pages_read}p` : ''
          return `<div class="session-row-item">
            <span class="session-date">${s.start_time.slice(0,10)}</span>
            <span class="session-dur">${fmtMins(mins)}</span>
            <span class="session-pages">${pages}</span>
            <button class="icon-del" onclick="deleteSession(${s.id},${book.id})">✕</button>
          </div>`
        }).join('')
      : '<div class="empty-hint">No sessions yet.</div>')
  } else if (tab === 'quotes') {
    c.innerHTML = (book.quotes||[]).map(q =>
      `<div class="quote-item">
         <span class="quote-text">"${q.text}"${q.page ? ` <em>— p.${q.page}</em>` : ''}</span>
         <button class="icon-del" onclick="deleteQuote(${q.id},${book.id})">✕</button>
       </div>`).join('') +
      `<div class="add-item-form">
         <input class="form-input" id="newQuoteTxt" placeholder="Add a quote…">
         <input class="form-input" id="newQuotePg" type="number" placeholder="Page" style="width:70px">
         <button class="btn-sm btn-blue" onclick="addQuote(${book.id})">Add</button>
       </div>`
  } else if (tab === 'notes') {
    c.innerHTML = (book.notes||[]).map(n =>
      `<div class="note-item">
         <span class="note-text">${n.text}${n.page ? ` <span class="note-page">p.${n.page}</span>` : ''}</span>
         <button class="icon-del" onclick="deleteNote(${n.id},${book.id})">✕</button>
       </div>`).join('') +
      `<div class="add-item-form">
         <input class="form-input" id="newNoteTxt" placeholder="Add a note…">
         <input class="form-input" id="newNotePg" type="number" placeholder="Page" style="width:70px">
         <button class="btn-sm btn-blue" onclick="addNote(${book.id})">Add</button>
       </div>`
  }
}

// Refresh detail tab after mutation
async function refreshDetailBook(bookId, tab) {
  try {
    const book = await api('GET', `/api/books/${bookId}`)
    el('bookDetailContent')._bookData = book
    renderDetailTab(tab, book)
    await loadAll(); renderShelf(); renderSetup()
  } catch(e) {}
}

async function rateBook(id, rating) {
  await api('PUT', `/api/books/${id}`, { rating })
  const book = await api('GET', `/api/books/${id}`)
  el('bookDetailContent')._bookData = book
  renderBookDetail(book)
}

async function setBookStatus(id, status) {
  const updates = { status }
  if (status === 'reading' && !books.find(b=>b.id===id)?.start_date) updates.start_date = getToday()
  if (status === 'finished') updates.finish_date = getToday()
  await api('PUT', `/api/books/${id}`, updates)
  await loadAll(); renderShelf(); renderSetup()
  const book = await api('GET', `/api/books/${id}`)
  el('bookDetailContent')._bookData = book
  renderBookDetail(book)
  toast(status === 'finished' ? '🎉 Book finished!' : 'Status updated')
  if (status === 'finished') await checkAchievements()
}

function confirmDeleteBook(bookId) {
  el('confirmTitle').textContent = 'Delete book?'
  el('confirmMsg').textContent   = 'All sessions, quotes, and notes for this book will be deleted.'
  el('confirmOverlay').classList.remove('hidden')
  el('confirmYes').onclick = async () => {
    await api('DELETE', `/api/books/${bookId}`)
    el('confirmOverlay').classList.add('hidden')
    closeBookDetail()
    await loadAll(); renderShelf(); renderSetup()
    toast('Book deleted')
  }
  el('confirmNo').onclick = () => el('confirmOverlay').classList.add('hidden')
}

async function deleteSession(sid, bookId) {
  await api('DELETE', `/api/sessions/${sid}`)
  await refreshDetailBook(bookId, 'sessions')
}
async function deleteQuote(qid, bookId) {
  await api('DELETE', `/api/quotes/${qid}`)
  await refreshDetailBook(bookId, 'quotes')
}
async function deleteNote(nid, bookId) {
  await api('DELETE', `/api/notes/${nid}`)
  await refreshDetailBook(bookId, 'notes')
}

async function addQuote(bookId) {
  const text = (el('newQuoteTxt').value || '').trim()
  const page = parseInt(el('newQuotePg').value) || null
  if (!text) return
  await api('POST', `/api/books/${bookId}/quotes`, { text, page })
  await refreshDetailBook(bookId, 'quotes')
}
async function addNote(bookId) {
  const text = (el('newNoteTxt').value || '').trim()
  const page = parseInt(el('newNotePg').value) || null
  if (!text) return
  await api('POST', `/api/books/${bookId}/notes`, { text, page })
  await refreshDetailBook(bookId, 'notes')
}

// ── ADD / EDIT BOOK POPUP ─────────────────────────────────────────────────────
function openAddBook(book = null) {
  editingBookId    = book?.id || null
  pendingCoverFile = null

  el('addBookTitle').textContent = book ? 'Edit Book' : 'Add Book'

  const form = el('bookForm')
  form.reset()

  if (book) {
    form.title.value        = book.title        || ''
    form.author.value       = book.author       || ''
    form.total_pages.value  = book.total_pages  || ''
    form.genre.value        = book.genre        || ''
    form.status.value       = book.status       || 'want'
    form.current_page.value = book.current_page || ''
    el('coverUrlInput').value = ''
  }

  const previewSrc = book?.cover_url || null
  if (previewSrc) {
    el('coverPreviewImg').src     = previewSrc
    el('coverPreviewImg').style.display = ''
    el('coverPreviewEmoji').style.display = 'none'
  } else {
    el('coverPreviewImg').style.display = 'none'
    el('coverPreviewEmoji').style.display = ''
  }

  el('currentPageRow').style.display = (form.status.value !== 'want') ? '' : 'none'
  el('addBookOverlay').classList.remove('hidden')
}

function closeAddBook() {
  el('addBookOverlay').classList.add('hidden')
  editingBookId = null; pendingCoverFile = null
}

async function uploadCover(file) {
  const fd = new FormData()
  fd.append('file', file)
  const r = await fetch('/api/upload/cover', { method: 'POST', body: fd })
  if (!r.ok) throw new Error('Upload failed')
  return (await r.json()).url
}

el('bookForm').onsubmit = async e => {
  e.preventDefault()
  const form = e.target
  const fd   = new FormData(form)

  let coverUrl = fd.get('cover_url') || null
  if (!coverUrl && editingBookId) coverUrl = books.find(b=>b.id===editingBookId)?.cover_url || null

  if (pendingCoverFile) {
    try { coverUrl = await uploadCover(pendingCoverFile) }
    catch { toast('Image upload failed'); return }
  }

  const payload = {
    title:        fd.get('title'),
    author:       fd.get('author')      || null,
    total_pages:  parseInt(fd.get('total_pages')),
    genre:        fd.get('genre')       || null,
    status:       fd.get('status'),
    current_page: parseInt(fd.get('current_page')) || 0,
    cover_url:    coverUrl || null,
  }

  try {
    if (editingBookId) {
      await api('PUT', `/api/books/${editingBookId}`, payload)
      toast('Book updated!')
    } else {
      await api('POST', '/api/books', payload)
      toast('Book added!')
    }
    closeAddBook()
    await loadAll(); renderShelf(); renderSetup()
    await checkAchievements()
  } catch { toast('Error saving book') }
}

el('coverFileInput').onchange = e => {
  const file = e.target.files[0]
  if (!file) return
  pendingCoverFile = file
  const reader = new FileReader()
  reader.onload = ev => {
    el('coverPreviewImg').src = ev.target.result
    el('coverPreviewImg').style.display = ''
    el('coverPreviewEmoji').style.display = 'none'
  }
  reader.readAsDataURL(file)
}

el('coverUrlInput').oninput = e => {
  const url = e.target.value.trim()
  if (url) {
    el('coverPreviewImg').src = url
    el('coverPreviewImg').style.display = ''
    el('coverPreviewEmoji').style.display = 'none'
    pendingCoverFile = null
  }
}

el('bookStatusSelect').onchange = e => {
  el('currentPageRow').style.display = e.target.value !== 'want' ? '' : 'none'
}

// ── ACHIEVEMENTS ──────────────────────────────────────────────────────────────
async function checkAchievements() {
  const unlockedIds   = new Set(achievements.map(a => a.badge_id))
  const finished      = books.filter(b => b.status === 'finished').length
  const totalSessions = books.reduce((s, b) => s + (b.sessions_count || 0), 0)

  const checks = [
    { id: 'first_session', test: totalSessions >= 1 },
    { id: 'five_sessions', test: totalSessions >= 5 },
    { id: 'first_finish',  test: finished >= 1 },
    { id: 'five_finish',   test: finished >= 5 },
    { id: 'ten_books',     test: books.length >= 10 },
  ]

  for (const { id, test } of checks) {
    if (test && !unlockedIds.has(id)) {
      try {
        await api('POST', '/api/achievements', { badge_id: id })
        achievements.push({ badge_id: id })
        unlockedIds.add(id)
        const badge = BADGES.find(b => b.id === id)
        if (badge) showAchievement(badge)
      } catch(e) {}
    }
  }
}

function showAchievement(badge) {
  const p = el('achCelebrate')
  el('achCelebEmoji').textContent = badge.emoji
  el('achCelebName').textContent  = badge.name
  p.classList.remove('hidden')
  clearTimeout(p._t)
  p._t = setTimeout(() => p.classList.add('hidden'), 3500)
}

function openAchievements() {
  el('achListOverlay').classList.remove('hidden')
  const unlockedIds = new Set(achievements.map(a => a.badge_id))
  el('achListContent').innerHTML = BADGES.map(b => {
    const done = unlockedIds.has(b.id)
    return `<div class="ach-badge ${done ? 'unlocked' : 'locked'}">
      <div class="ach-badge-emoji">${done ? b.emoji : '🔒'}</div>
      <div class="ach-badge-name">${b.name}</div>
      <div class="ach-badge-desc">${b.desc}</div>
    </div>`
  }).join('')
}

// ── SETTINGS ─────────────────────────────────────────────────────────────────
el('exportBtn').onclick = async () => {
  try {
    const r    = await fetch('/api/export')
    const blob = await r.blob()
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = 'library-backup.json'
    a.click()
  } catch { toast('Export error') }
}

el('importInput').onchange = async e => {
  const file = e.target.files[0]
  if (!file) return
  try {
    const data = JSON.parse(await file.text())
    await api('POST', '/api/import', { mode: 'overwrite', data })
    el('settingsOverlay').classList.add('hidden')
    await loadAll(); renderShelf(); renderSetup()
    await loadAndRenderStats()
    toast('Import successful!')
  } catch { toast('Import failed') }
}

// ── THEME ─────────────────────────────────────────────────────────────────────
function applyTheme() {
  const dark = localStorage.getItem('lib_theme') === 'dark'
  document.body.classList.toggle('dark', dark)
  el('themeToggle').textContent = dark ? '☀️' : '🌙'
}

el('themeToggle').onclick = () => {
  const now = document.body.classList.toggle('dark')
  localStorage.setItem('lib_theme', now ? 'dark' : 'light')
  el('themeToggle').textContent = now ? '☀️' : '🌙'
  renderEffect()
}

// ── INIT ──────────────────────────────────────────────────────────────────────
async function init() {
  applyTheme()
  renderEffect()

  // Session card
  el('startBtn').onclick = startSession
  el('pauseBtn').onclick = pauseSession
  el('stopBtn').onclick  = stopSession
  el('timeDown').onclick = () => {
    sessionTarget = Math.max(5, sessionTarget - 5)
    el('sessionTimeVal').textContent = `${sessionTarget} min`
  }
  el('timeUp').onclick = () => {
    sessionTarget = Math.min(120, sessionTarget + 5)
    el('sessionTimeVal').textContent = `${sessionTarget} min`
  }

  // Shelf card
  el('allBooksBtn').onclick = openLibList

  // Header
  el('addBookBtn').onclick  = () => openAddBook()
  el('achBtn').onclick      = openAchievements
  el('bgBtn').onclick       = openLandPicker
  el('settingsBtn').onclick = () => el('settingsOverlay').classList.remove('hidden')

  // Land picker popup
  el('landClose').onclick = () => el('landOverlay').classList.add('hidden')
  el('landOverlay').onclick = e => { if (e.target === el('landOverlay')) el('landOverlay').classList.add('hidden') }

  // Library list popup
  el('libListClose').onclick = closeLibList
  el('libListOverlay').onclick = e => { if (e.target === el('libListOverlay')) closeLibList() }
  el('libFilterTabs').onclick = e => {
    const btn = e.target.closest('[data-status]')
    if (!btn) return
    el('libFilterTabs').querySelectorAll('.shop-tab').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    renderLibList()
  }
  el('libSearch').oninput = renderLibList

  // Book detail popup
  el('bookDetailClose').onclick = closeBookDetail
  el('bookDetailOverlay').onclick = e => { if (e.target === el('bookDetailOverlay')) closeBookDetail() }

  // Add book popup
  el('addBookClose').onclick  = closeAddBook
  el('addBookCancel').onclick = closeAddBook
  el('addBookOverlay').onclick = e => { if (e.target === el('addBookOverlay')) closeAddBook() }

  // Settings
  el('settingsClose').onclick = () => el('settingsOverlay').classList.add('hidden')
  el('settingsOverlay').onclick = e => { if (e.target === el('settingsOverlay')) el('settingsOverlay').classList.add('hidden') }

  // Achievements
  el('achListClose').onclick = () => el('achListOverlay').classList.add('hidden')
  el('achListOverlay').onclick = e => { if (e.target === el('achListOverlay')) el('achListOverlay').classList.add('hidden') }

  // Confirm
  el('confirmOverlay').onclick = e => { if (e.target === el('confirmOverlay')) el('confirmOverlay').classList.add('hidden') }

  // Load & render
  await loadAll()
  renderSetup()
  await loadAndRenderStats()
}

init()
