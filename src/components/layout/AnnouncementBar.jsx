import { Link } from 'react-router-dom'
import { useSettings } from '../../lib/settings'

export function AnnouncementBar() {
  const settings = useSettings()
  const text = settings?.announcementText
  const href = settings?.announcementHref

  if (!text) return null
  // The API only accepts these two forms; checked again because settings are also read back from
  // this browser's storage. Anything else shows as plain text.
  const isInternal = /^\/(?![/\\])/.test(href ?? '')
  const isExternal = /^https?:\/\//i.test(href ?? '')
  return (
    <div className="bg-bar text-on-bar">
      <div className="shell flex min-h-9 items-center justify-center py-2 text-center text-[0.8125rem] tracking-[0.01em]">
        {isInternal ? (
          <Link to={href} className="link">
            {text}
          </Link>
        ) : isExternal ? (
          <a href={href} className="link">
            {text}
          </a>
        ) : (
          <p>{text}</p>
        )}
      </div>
    </div>
  )
}
