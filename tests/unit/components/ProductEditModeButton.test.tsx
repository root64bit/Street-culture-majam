import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductEditModeButton } from '@/components/admin/ProductEditModeButton';
import { AdminProductTable } from '@/components/admin/AdminProductTable';
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('full product editing entry points', () => {
  it('opens the complete product workspace from image, name and explicit edit link', () => {
    render(
      <AdminProductTable
        rows={[
          {
            id: 'product-1',
            name: 'Test Prada',
            brand_name: 'Prada',
            category_name: 'Eyewear',
            style_code: null,
            sku: null,
            active: true,
            archived_at: null,
            featured: false,
            most_wanted: false,
            updated_at: '2026-10-18',
            image_url: null,
            variants_count: 1,
            live_count: 1,
            lowest_price: 78,
          },
        ]}
        manage
        canExport={false}
        exportQuery=""
      />
    );
    for (const label of ['Open Test Prada', 'Test Prada', 'Edit product'])
      expect(screen.getByRole('link', { name: label })).toHaveAttribute(
        'href',
        '/admin/products/product-1?tab=all'
      );
  });
  it('does not unpublish anything merely by opening the editor or cancelling confirmation', () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ProductEditModeButton productId="product-1" />);
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish to edit product' }));
    expect(request).not.toHaveBeenCalled();
  });
  it('explicitly prepares the product and refreshes the editable workspace', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ unpublished: 1 })));
    vi.stubGlobal('fetch', request);
    render(<ProductEditModeButton productId="product-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish to edit product' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Ready to edit'));
    expect(request).toHaveBeenCalledWith(
      '/api/admin/products/product-1/edit-mode',
      expect.objectContaining({ method: 'POST' })
    );
    expect(router.refresh).toHaveBeenCalledOnce();
  });
  it('shows reservation errors without claiming the editor is unlocked', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: 'Active customer reservation.' }), { status: 409 })
        )
    );
    render(<ProductEditModeButton productId="product-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish to edit product' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Active customer reservation')
    );
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
