'use client'

import { useEffect, useState } from 'react'
import { ago, stamp, nameOf } from '@/lib/time'

export default function LinkBox({ link, who, count, mine, admin, onOpen, onRemove }) {
  const [broken, setBroken] = useState(false)
  const [iconBroken, setIconBroken] = useState(false)
  const [armed, setArmed] = useState(false)   // second click confirms the delete
  const c = count || { text: 0, voice: 0, shot: 0 }
  const canRemove = mine || admin

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3200)
    return () => clearTimeout(t)
  }, [armed])

  const host = link.site_name || safeHost(link.url)

  return (
    <article
      className="box"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
    >
      {canRemove && (
        <button
          className={'scrub' + (armed ? ' armed' : '')}
          title={mine ? 'Take this down' : 'Take this down (admin)'}
          onClick={e => {
            e.stopPropagation()
            if (armed) onRemove(); else setArmed(true)
          }}
        >
          {armed ? 'Sure?' : '✕'}
        </button>
      )}

      {link.image_url && !broken ? (
        <div className="shot">
          <img
            src={link.image_url}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
          />
        </div>
      ) : (
        <div className="shot blank">
          <span className="glyph">{(host || '?').slice(0, 2)}</span>
        </div>
      )}

      <div className="box-body">
        <div className="box-site">
          {link.favicon_url && !iconBroken && (
            <img
              src={link.favicon_url}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setIconBroken(true)}
            />
          )}
          <span className="mono">{host}</span>
        </div>

        <div className="box-title">{link.title || link.url}</div>
        {link.description && <div className="box-desc">{link.description}</div>}

        <div className="box-foot">
          <div className="tally">
            <span className={c.text ? 'has' : ''} title="notes">✎ {c.text}</span>
            <span className={c.voice ? 'has' : ''} title="voice notes">‣ {c.voice}</span>
            <span className={c.shot ? 'has' : ''} title="screenshots">▣ {c.shot}</span>
          </div>
        </div>
      </div>

      {/* only shows on hover — who put this up, and when */}
      <div className="credit">
        <div className="who">{nameOf(who)}</div>
        <div className="when">pinned {ago(link.created_at)}</div>
        <div className="exact">{stamp(link.created_at)}</div>
      </div>
    </article>
  )
}

function safeHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}
