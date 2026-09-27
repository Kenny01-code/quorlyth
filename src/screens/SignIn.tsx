import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Icon, GoogleG } from '../lib/Icon'
import { Logo } from '../lib/Logo'
import { useApp } from '../data/AppProvider'
import { Robot, RobotApi } from '../bot/Robot'
import { speakText } from '../ai/client'
import { useRef } from 'react'

function Stage({ greeting }: { greeting: string }) {
  const r = useRef<RobotApi | null>(null)
  const { toast } = useApp()
  const first = !localStorage.getItem('qseen')
  const hello = () => { r.current?.welcome(); speakText(greeting, 'coral', () => r.current?.talk(true), () => r.current?.talk(false)).catch(() => toast('Voice needs the AI server running')) }
  return (
    <div className="glass stage ok" id="stg">
      <Robot ref={r} onReady={() => { setTimeout(() => (first ? r.current?.welcome() : r.current?.wave()), 400) }} />
      <div className="c1 glass"><span className="chip"><Icon name="private" size={12} />Private session</span></div>
      <button className="chip hello" onClick={hello}><Icon name="voice" size={14} />Hear a hello</button>
      <div className="cap"><p className="dim">QuorlythBot</p><h3 style={{ fontSize: 22, fontWeight: 200, marginTop: 4 }}>Your room is ready.</h3></div>
    </div>
  )
}

export function SignIn() {
  const { backend, me, toast } = useApp()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const requested = params.get('next') || ''
  const next = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/dashboard'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset' | 'recovery'>(params.get('recovery') === '1' ? 'recovery' : 'signin')
  const [notice, setNotice] = useState<'verify' | 'reset' | ''>('')
  const [showPassword, setShowPassword] = useState(false)
  const local = backend?.auth.mode === 'local'
  const dest = () => {
    const target = sessionStorage.getItem('qreturn') || next
    sessionStorage.removeItem('qreturn')
    return target.startsWith('/') && !target.startsWith('//') ? target : '/dashboard'
  }

  useEffect(() => {
    if (requested) sessionStorage.setItem('qreturn', next)
    if (me && mode !== 'recovery') {
      const dest = sessionStorage.getItem('qreturn')
      if (dest) {
        sessionStorage.removeItem('qreturn')
        nav(dest, { replace: true })
      }
    }
  }, [requested, next, me?.id, mode, nav])

  if (me && mode !== 'recovery') {
    return (
      <div className="lg"><Stage greeting={`Hello, ${me.name.split(' ')[0]}. Welcome back to Quorlyth.`} />
        <div className="glass fm"><h2 style={{ fontSize: 40 }}>Welcome back, {me.name.split(' ')[0]}.</h2>
          <div className="acts"><button className="btn p" onClick={() => nav('/dashboard')}><Icon name="home" />Open dashboard</button>
            <button className="btn" onClick={() => backend?.auth.signOut()}>Sign out</button></div></div></div>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Enter a valid email address')
    setBusy(true)
    try {
      if (mode === 'reset') {
        await backend!.auth.resetPassword(email.trim())
        setNotice('reset')
      } else {
        if (password.length < 8) throw new Error('Use a password with at least 8 characters.')
        if ((mode === 'signup' || mode === 'recovery') && password !== confirm) throw new Error('Those passwords do not match.')
        if (mode === 'signup') {
          const r = await backend!.auth.signUpEmail(email.trim(), password)
          if (r.sentLink) setNotice('verify')
          else nav(dest(), { replace: true })
        } else if (mode === 'recovery') {
          await backend!.auth.updatePassword(password)
          toast('Password updated')
          setMode('signin')
          setPassword('')
          setConfirm('')
          nav(dest(), { replace: true })
        } else {
          await backend!.auth.signInEmail(email.trim(), password)
          nav(dest(), { replace: true })
        }
      }
    } catch (er: any) { toast(er.message || 'Could not sign in') }
    setBusy(false)
  }
  async function google() {
    try { await backend!.auth.signInGoogle() } catch (er: any) { toast(er.message || 'Google sign in is not set up') }
  }
  async function copyPageLink() {
    try { await navigator.clipboard.writeText(window.location.href); toast('Page link copied') }
    catch { toast('Could not copy the page link') }
  }
  async function continueAfterEmail() {
    try {
      const current = await backend!.auth.current()
      if (!current) return toast('Sign in or verify your email first')
      window.location.assign(dest())
    } catch (er: any) { toast(er.message || 'Could not check your sign-in') }
  }

  return (
    <div className="lg">
      <Stage greeting="Hello and welcome to Quorlyth, where your fans, in order, become a community." />
      <div className="glass fm">
        {notice ? (
          <div className="done"><div className="score"><Icon name="mail" size={30} /></div>
            <h2>{notice === 'verify' ? 'Check your inbox.' : 'Check your inbox.'}</h2>
            <p className="mut" style={{ marginTop: 12 }}>{notice === 'verify' ? `We sent a verification link to ${email}.` : `We sent password reset instructions to ${email}.`}</p>
            {notice === 'verify' && <button className="btn p" style={{ marginTop: 24 }} onClick={continueAfterEmail}>I have signed in</button>}
            {notice === 'reset' && <button className="btn p" style={{ marginTop: 24 }} onClick={() => { setNotice(''); setMode('signin') }}>Return to sign in</button>}
            <button className="btn" style={{ marginTop: 12 }} onClick={copyPageLink}>Copy page link</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h2 style={{ fontSize: 40 }}>{mode === 'signup' ? 'Create your account.' : mode === 'reset' ? 'Reset password.' : mode === 'recovery' ? 'Choose a new password.' : 'Welcome.'}</h2>
            <p className="mut" style={{ marginTop: 10 }}>{mode === 'signup' ? 'Use your email to join the space.' : mode === 'reset' ? 'We will email you a secure reset link.' : mode === 'recovery' ? 'Choose a new password for your account.' : 'Sign in to enter your space.'}</p>
            {(mode === 'signin' || mode === 'signup') && <>
              <button type="button" className="btn p wide" style={{ marginTop: 24 }} onClick={google}><GoogleG />Continue with Google</button>
              <div className="dv">or with email</div>
            </>}
            <label className="field"><span>Email</span>
              <div className="iw"><Icon name="mail" /><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@studio.com" autoComplete="email" required /></div></label>
            {mode !== 'reset' && <label className="field"><span>{mode === 'recovery' ? 'New password' : 'Password'}</span>
              <div className="iw"><Icon name="private" /><input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'signin' ? 'Your password' : 'At least 8 characters'} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={8} required /><button type="button" className="eye" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} title={showPassword ? 'Hide password' : 'Show password'}><Icon name="eye" size={16} /></button></div></label>}
            {(mode === 'signup' || mode === 'recovery') && <label className="field"><span>Confirm password</span>
              <div className="iw"><Icon name="private" /><input type={showPassword ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Enter it again" autoComplete="new-password" minLength={8} required /></div></label>}
            <button className="btn wide" disabled={busy}>{busy ? 'Please wait...' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : mode === 'recovery' ? 'Save new password' : 'Sign in'}</button>
            {local && <p className="dim" style={{ marginTop: 14, fontSize: 12 }}>Demo accounts are stored in this browser. Configure Supabase for shared accounts and Google sign-in.</p>}
            <div className="acts" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
              {mode === 'signin' && <><button type="button" className="chip" onClick={() => { setMode('signup'); setNotice('') }}>Create account</button>{!local && <button type="button" className="chip" onClick={() => setMode('reset')}>Forgot password?</button>}<button type="button" className="chip" onClick={continueAfterEmail}>I have signed in</button></>}
              {mode === 'signup' && <button type="button" className="chip" onClick={() => setMode('signin')}>Already have an account? Sign in</button>}
              {(mode === 'reset' || mode === 'recovery') && <button type="button" className="chip" onClick={() => { setMode('signin'); setPassword(''); setConfirm('') }}>Back to sign in</button>}
              <button type="button" className="chip" onClick={copyPageLink}>Copy page link</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
