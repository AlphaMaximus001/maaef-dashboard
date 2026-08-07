'use client'

import { useEffect, useRef, useState } from 'react'
import { clock } from '@/lib/time'

const CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const t of CANDIDATES) {
    try { if (MediaRecorder.isTypeSupported(t)) return t } catch { /* older browser */ }
  }
  return ''
}

export function extFor(mime = '') {
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

/**
 * Records straight off the microphone and hands the finished blob upward.
 * Nothing is uploaded here — the composer stages it so you can hear it back
 * and throw it away before anyone else does.
 */
export default function VoiceRecorder({ onDone, onError, busy }) {
  const [live, setLive] = useState(false)
  const [ms, setMs] = useState(0)
  const rec = useRef(null)
  const chunks = useRef([])
  const started = useRef(0)
  const timer = useRef(null)

  const stopTracks = () => {
    rec.current?.stream?.getTracks().forEach(t => t.stop())
    clearInterval(timer.current)
  }

  useEffect(() => () => { try { rec.current?.state === 'recording' && rec.current.stop() } catch {} ; stopTracks() }, [])

  async function start() {
    if (live || busy) return
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return onError('This browser will not record audio. Try Chrome, or attach a file instead.')
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      })
      const mime = pickMime()
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunks.current = []
      r.ondataavailable = e => { if (e.data?.size) chunks.current.push(e.data) }
      r.onstop = () => {
        const type = r.mimeType || mime || 'audio/webm'
        const blob = new Blob(chunks.current, { type })
        stopTracks()
        setLive(false)
        setMs(0)
        if (blob.size > 0) onDone(blob, Date.now() - started.current, type)
      }
      r.onerror = () => { stopTracks(); setLive(false); onError('The recording stopped unexpectedly.') }
      rec.current = r
      started.current = Date.now()
      r.start()
      setLive(true)
      timer.current = setInterval(() => setMs(Date.now() - started.current), 200)
    } catch (e) {
      onError(
        e?.name === 'NotAllowedError'
          ? 'Microphone blocked. Allow it in the address bar and try again.'
          : 'No microphone available.'
      )
    }
  }

  function stop() {
    clearInterval(timer.current)
    try { rec.current?.state === 'recording' && rec.current.stop() } catch { setLive(false) }
  }

  function scrap() {
    chunks.current = []
    const r = rec.current
    if (r) r.onstop = () => { stopTracks(); setLive(false); setMs(0) }
    try { r?.state === 'recording' && r.stop() } catch { setLive(false) }
  }

  if (!live) {
    return (
      <button className="tool" onClick={start} disabled={busy} title="Record a voice note">
        ● Voice
      </button>
    )
  }

  return (
    <>
      <button className="tool rec" onClick={stop} title="Stop and keep">
        <span className="dot" /> {clock(ms)} · Stop
      </button>
      <button className="tool" onClick={scrap} title="Throw it away">Scrap</button>
    </>
  )
}
