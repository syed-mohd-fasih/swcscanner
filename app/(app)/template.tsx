/**
 * Re-mounts on every navigation: each screen fades in gently so the change
 * of page is visible without getting in the way. Opacity only: a transform
 * here would break the fixed action bars inside pages.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-in fade-in-0 duration-300 ease-out">{children}</div>
}
