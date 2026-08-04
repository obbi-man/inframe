(() => {
  const VERSION = 4
  if (window.__inframeVersion === VERSION) return
  // cleanup previous inject
  document.querySelectorAll('.inframe-insert-btn').forEach((n) => n.remove())
  document.getElementById('inframe-inject-style')?.remove()
  window.__inframeVersion = VERSION

  const STYLE_ID = 'inframe-inject-style'
  const BTN_CLASS = 'inframe-insert-btn'
  let activeEl = null
  let hideTimer = null

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      .${BTN_CLASS} {
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
        display: none;
      }
      .${BTN_CLASS}:hover { filter: brightness(1.06); }
    `
    document.documentElement.appendChild(style)
  }

  function isHttpUrl(url) {
    return typeof url === 'string' && /^https?:\/\//i.test(url)
  }

  function collectCandidateUrls(el) {
    const urls = []
    const push = (u) => {
      if (u && !urls.includes(u)) urls.push(u)
    }
    if (!el) return urls

    if (el.tagName === 'VIDEO') {
      push(el.getAttribute('data-src'))
      push(el.getAttribute('data-video-url'))
      push(el.getAttribute('data-url'))
      el.querySelectorAll('source').forEach((source) => {
        push(source.src)
        push(source.getAttribute('data-src'))
        push(source.getAttribute('srcset'))
      })
      push(el.currentSrc)
      push(el.src)

      // parent card links / download attrs (Pexels and similar)
      let node = el.parentElement
      for (let i = 0; i < 6 && node; i += 1) {
        push(node.getAttribute('data-video-url'))
        push(node.getAttribute('data-big-src'))
        push(node.getAttribute('href'))
        node.querySelectorAll('a[href]').forEach((a) => push(a.href))
        node = node.parentElement
      }
    } else {
      push(el.currentSrc)
      push(el.src)
      push(el.getAttribute('data-src'))
      push(el.getAttribute('data-lazy-src'))
      push(el.getAttribute('srcset')?.split(',')[0]?.trim().split(' ')[0])
    }

    // recent network media as fallback for blob players
    if (Array.isArray(window.__inframeNetworkMedia)) {
      window.__inframeNetworkMedia.forEach(push)
    }
    return urls
  }

  function resolveUrl(el) {
    const candidates = collectCandidateUrls(el)
    const http = candidates.find(isHttpUrl)
    if (http) return http
    return candidates[0] || ''
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
      if (!activeEl || !window.inframeGuest?.insert) return
      const url = resolveUrl(activeEl)
      const kind = activeEl.tagName === 'VIDEO' ? 'video' : 'image'
      window.inframeGuest.insert(url || `__recent__:${kind}`)
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
    }, 700)
  }

  function bindMedia(el) {
    if (el.__inframeBoundV4) return
    el.__inframeBoundV4 = true
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
    if (list.length > 30) list.length = 30
  }

  // Observe Performance for media downloads on the page
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
  }

  scan()
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
