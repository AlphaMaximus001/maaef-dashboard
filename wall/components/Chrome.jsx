'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import SignOut from './SignOut'

export default function Chrome({ me, children }) {
  const path = usePathname()
  const admin = me.role === 'admin' || me.role === 'owner'
  const link = (href, label) => (
    <Link href={href} className={'navlink' + (path === href ? ' on' : '')}>{label}</Link>
  )
  return (
    <div className="bar">
      <div className="mark">The Wall<span>Maaef</span></div>
      {children}
      <div className="bar-sp" />
      {link('/wall', 'Wall')}
      {admin && link('/admin', 'Users')}
      <span className="whoami">{me.email} · {me.role}</span>
      <SignOut ghost />
    </div>
  )
}
