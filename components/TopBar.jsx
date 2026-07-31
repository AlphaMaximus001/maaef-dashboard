'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import SignOut from './SignOut'

export default function TopBar({ role, email, children }) {
  const path = usePathname()
  const editor = role === 'admin' || role === 'superadmin'
  const link = (href, label) => (
    <Link href={href} className={'navlink' + (path === href ? ' on' : '')}>{label}</Link>
  )
  return (
    <div className="bar">
      <div className="mark">UP Irrigation<span>Posting Directory</span></div>
      {children}
      <div className="bar-sp" />
      {link('/dashboard', 'Dashboard')}
      {editor && link('/entry', 'Entry')}
      {role === 'superadmin' && link('/users', 'Users')}
      <span className="whoami">{email} · {role}</span>
      <SignOut ghost />
    </div>
  )
}
