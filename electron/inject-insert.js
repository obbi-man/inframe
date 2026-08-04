(() => {
  const VERSION = 5
  if (window.__inframeVersion === VERSION) return
  document.querySelectorAll('.inframe-insert-btn, .inframe-page-insert').forEach((n) => n.remove())
  document.getElementById('inframe-inject-style')?.remove()
  window.__inframeVersion = VERSION

  const STYLE_ID = 'inframe-inject-style'
  const BTN_CLASS = 'inframe-insert-btn'
  const PAGE_BTN_CLASS = 'inframe-page-insert'
  let activeEl = null
  let hideTimer = null

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      .${BTN_CLASS}, .${PAGE_BTN_CLASS} {
        position: fixed;
        z-index: 2147483646;
        padding: 8px 12px;
        border: 0;
        border-radius: 8px;
        background: #e8a045;
        color: #1a1208;
        font: 600 12px/1.2 "Segoe UI", system-ui, sans-serif;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(0,0,0,.4);
        pointer-events: auto;
      }
      .${BTN_CLASS} { display: none; }
      .${PAGE_BTN_CLASS} {
        right: 18px;
        bottom: 18px;
        padding: 12px 16px;
        font-size: 13px;
      }
      .${BTN_CLASS}:hover, .${PAGE_BTN_CLASS}:hover { filter: brightness(1.06); }
    `
    document.documentElement.appendChild(style)
  }

  function isHttpUrl(url) {
    return typeof url === 'string' && /^https?:\/\//i.test(url)
  }

  function decodeUrl(raw) {
    return String(raw || '')
      .replace(/\\u002F/g, '/')
      .replace(/\\\//g, '/')
      .replace(/&amp;/g, '&')
  }

  function scrapePageVideoUrls() {
    const found = new Set()
    const push = (u) => {
      const url = decodeUrl(u)
      if (!isHttpUrl(url)) return
      if (
        /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) ||
        /videos\.pexels\.com|video-files|player\.vimeo|cdn\.pixabay/i.test(url)
      ) {
        found.add(url.split('#')[0])
      }
    }

    const html = document.documentElement.innerHTML
    const re = /https?:\/\/[^"'\\\s<>]+/g
    let match
    while ((match = re.exec(html))) {
      if (/videos\.pexels\.com|video-files|\.mp4|\.webm|\.mov/i.test(match[0])) push(match[0])
    }

    const next = document.getElementById('__NEXT_DATA__')
    if (next?.textContent) {
      try {
        const walk = (node) => {
          if (!node) return
          if (typeof node === 'string') push(node)
          else if (Array.isArray(node)) node.forEach(walk)
          else if (typeof node === 'object') Object.values(node).forEach(walk)
        }
        walk(JSON.parse(next.textContent))
      } catch {
        /* ignore */
      }
    }

    document.querySelectorAll('a[href], video[src], source[src], meta[content]').forEach((el) => {
      push(el.href || el.src || el.content || el.getAttribute('href') || el.getAttribute('src'))
    })

    if (Array.isArray(window.__inframeNetworkMedia)) {
      window.__inframeNetworkMedia.forEach(push)
    }

    return [...found]
  }

  function pickBestVideo(urls) {
    if (!urls.length) return ''
    const scored = urls.map((u) => {
      let score = 0
      if (/\.mp4(\?|$)/i.test(u)) score += 50
      if (/1080|uhd|hd\.|1920/i.test(u)) score += 30
      if (/720|1280/i.test(u)) score += 20
      if (/540|640|sd/i.test(u)) score += 5
      if (/videos\.pexels\.com\/video-files/i.test(u)) score += 15
      if (/\.m3u8|\.mpd|hls/i.test(u)) score -= 40
      return { u, score }
    })
    scored.sort((a, b) => b.score - a.score)
    return scored[0]?.u || ''
  }

  function pexelsDownloadFallback() {
    const m = location.pathname.match(/\/video\/(?:[^/]*-)?(\d+)\/?/i)
    if (!m) return ''
    return `https://www.pexels.com/download/video/${m[1]}/`
  }

  function resolveBestPageVideo() {
    return pickBestVideo(scrapePageVideoUrls()) || pexelsDownloadFallback()
  }

  function collectCandidateUrls(el) {
    const urls = []
    const push = (u) => {
      const url = decodeUrl(u)
      if (url && !urls.includes(url)) urls.push(url)
    }
    if (!el) return urls

    if (el.tagName === 'VIDEO') {
      push(el.getAttribute('data-src'))
      push(el.getAttribute('data-video-url'))
      push(el.getAttribute('data-url'))
      el.querySelectorAll('source').forEach((source) => {
        push(source.src)
        push(source.getAttribute('data-src'))
      })
      push(el.currentSrc)
      push(el.src)
      let node = el.parentElement
      for (let i = 0; i < 6 && node; i += 1) {
        push(node.getAttribute('data-video-url'))
        push(node.getAttribute('href'))
        node.querySelectorAll('a[href]').forEach((a) => push(a.href))
        node = node.parentElement
      }
    } else {
      push(el.currentSrc)
      push(el.src)
      push(el.getAttribute('data-src'))
      push(el.getAttribute('data-lazy-src'))
    }

    scrapePageVideoUrls().forEach(push)
    if (Array.isArray(window.__inframeNetworkMedia)) {
      window.__inframeNetworkMedia.forEach(push)
    }
    return urls
  }

  function resolveUrl(el) {
    const candidates = collectCandidateUrls(el)
    const httpVideo = candidates.find(
      (u) => isHttpUrl(u) && (/\.(mp4|webm|mov)(\?|$)/i.test(u) || /videos\.pexels\.com/i.test(u)),
    )
    if (httpVideo) return httpVideo
    const http = candidates.find(isHttpUrl)
    if (http) return http
    return resolveBestPageVideo()
  }

  function getSharedButton() {
    let btn = document.querySelector(`.${BTN_CLASS}`)
    if (btn) return btn
    btn = document.createElement('button')
    btn.className = BTN_CLASS
    btn.type = 'button'
    btn.addEventListener('mouseenter', () => {
      if (hideTimer) {
        clearTimeout(hideTimer)
        hideTimer = null
      }
    })
    btn.addEventListener('mouseleave', () => scheduleHide())
    btn.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (!window.inframeGuest?.insert) return
      const url = activeEl ? resolveUrl(activeEl) : resolveBestPageVideo()
      window.inframeGuest.insert(url || '__recent__:video')
    })
    document.documentElement.appendChild(btn)
    return btn
  }

  function placeButton(el) {
    if (!el || !el.isConnected) return
    const rect = el.getBoundingClientRect()
    if (rect.width < 70 || rect.height < 70) return

    activeEl = el
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }

    const btn = getSharedButton()
    const isVideo = el.tagName === 'VIDEO'
    btn.textContent = isVideo ? 'Вставить видео' : 'Вставить'
    const left = Math.min(window.innerWidth - 20, Math.max(20, rect.left + rect.width / 2))
    const top = Math.min(window.innerHeight - 20, Math.max(20, rect.top + 18))
    btn.style.left = `${left}px`
    btn.style.top = `${top}px`
    btn.style.transform = 'translate(-50%, 0)'
    btn.style.display = 'block'
  }

  function scheduleHide() {
    if (hideTimer) clearTimeout(hideTimer)
    hideTimer = setTimeout(() => {
      const btn = document.querySelector(`.${BTN_CLASS}`)
      if (btn && !btn.matches(':hover')) {
        btn.style.display = 'none'
        activeEl = null
      }
    }, 900)
  }

  function bindMedia(el) {
    if (el.__inframeBoundV5) return
    el.__inframeBoundV5 = true
    el.addEventListener('mouseenter', () => placeButton(el))
    el.addEventListener('mousemove', () => placeButton(el))
    el.addEventListener('mouseleave', (event) => {
      const to = event.relatedTarget
      if (to && (to.classList?.contains(BTN_CLASS) || to.closest?.(`.${BTN_CLASS}`))) return
      scheduleHide()
    })
  }

  function trackNetworkHint(url) {
    if (!isHttpUrl(url)) return
    if (!window.__inframeNetworkMedia) window.__inframeNetworkMedia = []
    const list = window.__inframeNetworkMedia
    if (list[0] !== url) list.unshift(url)
    if (list.length > 40) list.length = 40
  }

  function tryRepairBrokenVideos() {
    const mp4 = pickBestVideo(scrapePageVideoUrls())
    if (!mp4) return
    document.querySelectorAll('video').forEach((video) => {
      const broken = Boolean(video.error) || !video.currentSrc || video.networkState === 3
      if (!broken) return
      try {
        video.pause()
        video.src = mp4
        video.load()
      } catch {
        /* ignore */
      }
    })
  }

  function ensurePageInsertButton() {
    const isVideoPage =
      /\/video\//i.test(location.pathname) ||
      document.querySelector('video') ||
      /videos\.pexels\.com/i.test(document.documentElement.innerHTML)

    let btn = document.querySelector(`.${PAGE_BTN_CLASS}`)
    if (!isVideoPage) {
      btn?.remove()
      return
    }
    if (!btn) {
      btn = document.createElement('button')
      btn.className = PAGE_BTN_CLASS
      btn.type = 'button'
      btn.textContent = 'Вставить видео со страницы'
      btn.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!window.inframeGuest?.insert) return
        window.inframeGuest.insert(resolveBestPageVideo() || '__recent__:video')
      })
      document.documentElement.appendChild(btn)
    }
  }

  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const name = entry.name || ''
        if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(name) || /videos\.pexels\.com/i.test(name)) {
          trackNetworkHint(name)
        }
      }
    })
    po.observe({ entryTypes: ['resource'] })
  } catch {
    /* ignore */
  }

  function scan() {
    ensureStyle()
    document.querySelectorAll('img, video').forEach(bindMedia)
    tryRepairBrokenVideos()
    ensurePageInsertButton()
  }

  scan()
  setTimeout(scan, 800)
  setTimeout(scan, 2000)
  const observer = new MutationObserver(() => scan())
  observer.observe(document.documentElement, { childList: true, subtree: true })
  window.addEventListener(
    'scroll',
    () => {
      if (activeEl) placeButton(activeEl)
    },
    { passive: true },
  )
})()
