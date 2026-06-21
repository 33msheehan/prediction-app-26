import Link from 'next/link';

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/forecasts/new', label: 'New forecast' },
  { href: '/calibration', label: 'Calibration' },
];

export function Nav() {
  return (
    <nav aria-label="Main">
      <ul className="flex gap-4 border-b border-black/10 px-6 py-4 dark:border-white/10">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href}>{link.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
