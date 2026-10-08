'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  ArrowUpRight,
  CreditCard,
  FileSpreadsheet,
  LayoutDashboard,
  Layers3,
  Menu,
  Package,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Tags,
  UserRound,
  Wallet,
  Users,
  ScrollText,
  Truck,
  FolderTree,
  Badge,
  Percent,
  Settings,
  Images,
  ChartNoAxesCombined,
  Bell,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SearchCommand } from '@/components/admin/SearchCommand';

const groups = [
  {
    label: 'Workspace',
    items: [
      { label: 'Dashboard', href: '/admin', icon: LayoutDashboard, capability: 'dashboard.read' },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { label: 'Products', href: '/admin/products', icon: Package, capability: 'products.read' },
      { label: 'Brands', href: '/admin/brands', icon: Badge, capability: 'brands.manage' },
      {
        label: 'Categories',
        href: '/admin/categories',
        icon: FolderTree,
        capability: 'categories.manage',
      },
      { label: 'Media library', href: '/admin/media', icon: Images, capability: 'media.manage' },
      { label: 'Inventory', href: '/admin/inventory', icon: Layers3, capability: 'inventory.read' },
      {
        label: 'Product imports',
        href: '/admin/imports',
        icon: FileSpreadsheet,
        capability: 'products.import',
      },
    ],
  },
  {
    label: 'Commerce',
    items: [
      { label: 'Orders', href: '/admin/orders', icon: ShoppingBag, capability: 'orders.read' },
      { label: 'Payments', href: '/admin/payments', icon: CreditCard, capability: 'payments.read' },
      { label: 'Shipping', href: '/admin/shipping', icon: Truck, capability: 'shipping.read' },
    ],
  },
  {
    label: 'Seller operations',
    items: [
      {
        label: 'Consignments',
        href: '/admin/consignments',
        icon: Tags,
        capability: 'consignments.read',
      },
      {
        label: 'Authentication',
        href: '/admin/authentication',
        icon: ShieldCheck,
        capability: 'authentication.review',
      },
      { label: 'Sellers', href: '/admin/sellers', icon: Users, capability: 'sellers.read' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Payouts', href: '/admin/payouts', icon: Wallet, capability: 'payouts.read' },
      {
        label: 'Commissions',
        href: '/admin/commissions',
        icon: Percent,
        capability: 'commissions.read',
      },
    ],
  },
  {
    label: 'Governance',
    items: [
      {
        label: 'Customers',
        href: '/admin/customers',
        icon: UserRound,
        capability: 'customers.read',
      },
      {
        label: 'Reports',
        href: '/admin/reports',
        icon: ChartNoAxesCombined,
        capability: 'reports.read',
      },
      {
        label: 'Operational inbox',
        href: '/admin/notifications',
        icon: Bell,
        capability: 'notifications.read',
      },
      { label: 'Staff & roles', href: '/admin/staff', icon: Users, capability: 'roles.read' },
      { label: 'Audit log', href: '/admin/audit', icon: ScrollText, capability: 'audit.read' },
      { label: 'Settings', href: '/admin/settings', icon: Settings, capability: 'settings.read' },
    ],
  },
];

function titleFor(pathname: string) {
  if (pathname === '/admin') return 'Dashboard';
  if (pathname === '/admin/products/new') return 'New product';
  if (pathname.startsWith('/admin/products/')) return 'Product detail';
  if (pathname.startsWith('/admin/imports/')) return 'Import preview';
  if (pathname.startsWith('/admin/orders/')) return 'Order detail';
  if (pathname === '/admin/payments/reconciliation') return 'Payment reconciliation';
  if (pathname.startsWith('/admin/consignments/')) return 'Consignment detail';
  if (pathname.startsWith('/admin/authentication/')) return 'Authentication review';
  return (
    groups.flatMap((group) => group.items).find((item) => item.href === pathname)?.label ??
    'Operations'
  );
}

export function AdminShell({
  children,
  permissions,
  userEmail,
}: {
  children: React.ReactNode;
  permissions: string[];
  userEmail: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const allowed = new Set(permissions);
  const currentTitle = titleFor(pathname);
  const sidebar = (
    <>
      <Link
        href="/admin"
        onClick={() => setMobileOpen(false)}
        className="flex items-center gap-3 border-b border-white/10 px-5 py-5"
      >
        <Image
          src="/brand/street-culture-icon.png"
          alt=""
          width={40}
          height={42}
          className="h-10 w-10 rounded-lg object-contain"
        />
        <span className="min-w-0">
          <strong className="block text-xs font-black uppercase tracking-[0.1em]">
            Street Culture
          </strong>
          <span className="mt-1 block text-[10px] uppercase tracking-[0.2em] text-[#a6b8b2]">
            Operations console
          </span>
        </span>
      </Link>
      <nav aria-label="Admin navigation" className="flex-1 overflow-y-auto px-3 py-6">
        {groups.map((group) => {
          const items = group.items.filter((item) => allowed.has(item.capability));
          if (!items.length) return null;
          return (
            <div key={group.label} className="mb-7">
              <p className="px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#729188]">
                {group.label}
              </p>
              <div className="mt-3 space-y-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  const selected =
                    pathname === item.href ||
                    (item.href !== '/admin' && pathname.startsWith(`${item.href}/`));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      aria-current={selected ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition',
                        selected
                          ? 'bg-[#c6ff00] text-[#0b1512]'
                          : 'text-[#bacbc5] hover:bg-white/10 hover:text-white'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-4">
        <p className="truncate text-xs font-semibold text-white">{userEmail}</p>
        <div className="mt-3 flex gap-3 text-[11px] text-[#a6b8b2]">
          <Link href="/account" className="inline-flex items-center gap-1 hover:text-white">
            <UserRound className="h-3.5 w-3.5" /> Account
          </Link>
          <Link href="/" className="inline-flex items-center gap-1 hover:text-white">
            Storefront <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#f4f6f3] text-[#17251f] lg:flex">
      <aside className="sticky top-0 hidden h-screen w-[250px] shrink-0 flex-col bg-[#0d211a] text-white lg:flex">
        {sidebar}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            type="button"
            aria-label="Close admin menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <aside className="relative flex h-full w-[280px] flex-col bg-[#0d211a] text-white">
            {sidebar}
          </aside>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-[#dce5df] bg-white/95 px-4 backdrop-blur-lg sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open admin menu"
              className="rounded-lg border border-[#dce5df] p-2 lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#6f8379]">
                Street Culture / Admin
              </p>
              <p className="truncate text-sm font-bold">{currentTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <SearchCommand />
            {allowed.has('notifications.read') && (
              <Link
                href="/admin/notifications"
                aria-label="Operational inbox"
                className="rounded-lg border border-[#dce6dc] p-2 text-[#61766b]"
              >
                <Bell className="h-4 w-4" />
              </Link>
            )}
            {allowed.has('products.write') && (
              <Link
                href="/admin/products/new"
                className="inline-flex items-center gap-2 rounded-full bg-[#0d211a] px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white transition hover:bg-[#065f46]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New product</span>
                <span className="sm:hidden">New</span>
              </Link>
            )}
          </div>
        </div>
        <div className="mx-auto max-w-[1600px]">{children}</div>
      </div>
    </div>
  );
}
