export interface NavItem {
  id: string;
  href: string;
  label: string;
  external: boolean;
}

export const NAV: NavItem[] = [
  { id: 'dashboard', href: '/',                                          label: 'system',    external: false },
  { id: 'tasks',     href: '/tasks',                                     label: 'agents',    external: false },
  { id: 'boreal',    href: 'https://commander.merulox.com/?view=leads',  label: 'boréal',    external: true  },
  { id: 'orbit',     href: '/orbit',                                     label: 'orbit',     external: false },
  { id: 'now',       href: '/now',                                       label: 'now',       external: false },
  { id: 'design',    href: '/design',                                    label: 'design',    external: false },
  { id: 'code',      href: '/code',                                      label: 'code',      external: false },
  { id: 'red-team',  href: '/red-team',                                  label: 'hacking',   external: false },
];
