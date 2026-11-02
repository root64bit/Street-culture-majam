import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductSizeFields } from '@/components/ui/ProductSizeFields';
import { StockDraftForm } from '@/components/admin/StockDraftForm';
import { VariantEditor } from '@/components/admin/VariantEditor';
import { VariantGenerator } from '@/components/admin/VariantGenerator';
import { type ProductSizeSystem } from '@/lib/product-sizes';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Harness({
  initialSize = '',
  initialSystem = 'UK',
}: {
  initialSize?: string;
  initialSystem?: ProductSizeSystem;
}) {
  const [size, setSize] = useState(initialSize);
  const [system, setSystem] = useState<ProductSizeSystem>(initialSystem);
  return (
    <form data-testid="size-form">
      <ProductSizeFields
        size={size}
        system={system}
        onSizeChange={setSize}
        onSystemChange={setSystem}
      />
    </form>
  );
}

describe('UK and complete numeric size entry', () => {
  it('offers whole and half numbers through 100, including zero, and submits the exact UK label', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Size system')).toHaveValue('UK');
    const size = screen.getByLabelText('Size');
    expect(size.querySelectorAll('option')).toHaveLength(203);
    for (const value of ['0', '0.5', '7', '7.5', '9.5', '10', '20', '99.5', '100']) {
      fireEvent.change(size, { target: { value } });
      expect(new FormData(screen.getByTestId('size-form') as HTMLFormElement).get('size')).toBe(
        value
      );
    }
    expect(new FormData(screen.getByTestId('size-form') as HTMLFormElement).get('sizeSystem')).toBe(
      'UK'
    );
  });

  it('supports apparel and one-size accessories without pretending they are UK shoe sizes', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Size system'), { target: { value: 'STANDARD' } });
    for (const value of ['OS', 'XS', 'L', 'XXL', '32']) {
      fireEvent.change(screen.getByLabelText('Size'), { target: { value } });
      expect(new FormData(screen.getByTestId('size-form') as HTMLFormElement).get('size')).toBe(
        value
      );
    }
  });

  it('preserves existing custom children and fractional labels and allows entering another exact label', () => {
    render(<Harness initialSize="10C" />);
    expect(screen.getByLabelText('Custom size')).toHaveValue('10C');
    fireEvent.change(screen.getByLabelText('Custom size'), { target: { value: '23.25' } });
    expect(new FormData(screen.getByTestId('size-form') as HTMLFormElement).get('size')).toBe(
      '23.25'
    );
    fireEvent.change(screen.getByLabelText('Size'), { target: { value: '9.5' } });
    expect(screen.queryByLabelText('Custom size')).not.toBeInTheDocument();
  });

  it('sends UK half sizes to inventory without creating or publishing stock automatically', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ listingId: 'listing-test' })));
    vi.stubGlobal('fetch', request);
    render(<StockDraftForm productId="product-test" initialStock={[]} productArchived={false} />);
    expect(request).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Size'), { target: { value: '9.5' } });
    fireEvent.change(screen.getByLabelText(/Asking price/), { target: { value: '123.45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add inventory draft' }));
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({
      size: '9.5',
      sizeSystem: 'UK',
      askingPrice: 123.45,
    });
  });

  it('preserves an existing variant system instead of silently converting it to UK', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', request);
    render(
      <VariantEditor
        productId="product-test"
        variant={{
          id: 'variant-test',
          size: '10.5',
          size_system: 'US',
          sku: null,
          color: null,
          active: true,
          price_override: null,
        }}
      />
    );
    expect(screen.getByLabelText('Size system')).toHaveValue('US');
    expect(screen.getByLabelText('Size')).toHaveValue('10.5');
    fireEvent.click(screen.getByRole('button', { name: 'Save variant' }));
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({
      size: '10.5',
      sizeSystem: 'US',
    });
  });

  it('defaults size-range generation to UK but adds no sizes until explicitly submitted', () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    render(<VariantGenerator productId="product-test" />);
    expect(screen.getByLabelText('Size system')).toHaveValue('UK');
    expect(request).not.toHaveBeenCalled();
  });
});
