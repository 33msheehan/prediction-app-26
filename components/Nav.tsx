import Link from 'next/link';

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/forecasts/new', label: 'New forecast' },
  { href: '/calibration', label: 'Calibration' },
];

export function Nav() {
  return (
    <nav aria-label="Main" className="flex items-center gap-6 px-6 py-3">
      <Link href="/" className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-sm text-accent-fg"
        >
          ▟
        </span>
        <span className="text-sm font-medium text-fg">Forecast Workbench</span>
      </Link>
      <ul className="flex gap-4">
        {links.map((link) => (
          <li key={link.href}>
            <Link className="text-sm text-muted transition hover:text-fg" href={link.href}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
