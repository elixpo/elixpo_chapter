import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getDB } from '@/lib/db';
import type { UrlRecord } from '@/lib/types';
import UrlsListClient from './UrlsListClient';
import { Icon, PageHeader } from '@/app/components/app/ui';

export const runtime = 'edge';

type StatusFilter = 'all' | 'active' | 'inactive' | 'expired';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'expired', label: 'Expired' },
];

const PAGE_SIZE = 20;

export default async function UrlsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}) {
  const {
    page: pageParam,
    search: searchParam,
    status: statusParam,
  } = await searchParams;

  const user = (await getCurrentUser())!;
  const db = getDB();
  const page = Math.max(1, Number.parseInt(pageParam || '1') || 1);
  const search = (searchParam || '').slice(0, 100);
  const status: StatusFilter =
    statusParam === 'active' ||
    statusParam === 'inactive' ||
    statusParam === 'expired'
      ? statusParam
      : 'all';
  const offset = (page - 1) * PAGE_SIZE;

  // Build query — proper LIKE-wildcard escaping so a user typing `%` or `_`
  // doesn't get a runaway match. ESCAPE clause uses backslash.
  let where = 'user_id = ?';
  const params: any[] = [user.id];

  if (search) {
    const escaped = search.replace(/[%_]/g, '\\$&');
    const like = `%${escaped}%`;
    where +=
      " AND (short_code LIKE ? ESCAPE '\\' OR original_url LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' OR campaign LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')";
    params.push(like, like, like, like, like);
  }

  if (status === 'active') {
    where += ' AND is_active = 1 AND (expires_at IS NULL OR expires_at > ?)';
    params.push(new Date().toISOString());
  } else if (status === 'inactive') {
    where += ' AND is_active = 0';
  } else if (status === 'expired') {
    where += ' AND expires_at IS NOT NULL AND expires_at <= ?';
    params.push(new Date().toISOString());
  }

  const listQuery = `SELECT * FROM urls WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  const countQuery = `SELECT COUNT(*) as count FROM urls WHERE ${where}`;

  const [{ results }, total] = await Promise.all([
    db
      .prepare(listQuery)
      .bind(...params, PAGE_SIZE, offset)
      .all<UrlRecord>(),
    db.prepare(countQuery).bind(...params).first<{ count: number }>(),
  ]);

  const totalPages = Math.max(1, Math.ceil((total?.count || 0) / PAGE_SIZE));

  const count = total?.count ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow="Links"
        title="My URLs"
        lede={
          <>
            {count} link{count === 1 ? '' : 's'}
            {search || status !== 'all' ? ' match' : ' total'}
            {search ? ` · filtered by “${search}”` : ''}
            {status !== 'all' ? ` · ${status}` : ''}
          </>
        }
        actions={
          <>
            <a
              href="/api/urls/export.csv"
              className="btn-secondary"
              title="Download every link as CSV"
            >
              <Icon.download />
              Export CSV
            </a>
            <Link href="/dashboard/new" className="btn-primary">
              <Icon.plus />
              Shorten URL
            </Link>
          </>
        }
      />

      <section className="panel" aria-label="Links">
        {/* Search + filter chips */}
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <form method="get" role="search" className="w-full md:max-w-md">
            {status !== 'all' && (
              <input type="hidden" name="status" value={status} />
            )}
            <label htmlFor="url-search" className="sr-only">
              Search links
            </label>
            <div className="control-wrap">
              <Icon.search />
              <input
                id="url-search"
                type="search"
                name="search"
                placeholder="Search by slug, destination, or title…"
                defaultValue={search}
                className="control"
              />
            </div>
          </form>

          <nav aria-label="Filter by status" className="seg self-start md:self-auto">
            {STATUS_FILTERS.map((f) => {
              const active = f.value === status;
              const params = new URLSearchParams();
              if (search) params.set('search', search);
              if (f.value !== 'all') params.set('status', f.value);
              const href = params.toString()
                ? `/dashboard/urls?${params.toString()}`
                : '/dashboard/urls';
              return (
                <Link
                  key={f.value}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                >
                  {f.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Client-side selection + bulk actions + table render */}
        <UrlsListClient
          urls={results || []}
          page={page}
          totalPages={totalPages}
          search={search}
          status={status}
        />
      </section>
    </div>
  );
}
