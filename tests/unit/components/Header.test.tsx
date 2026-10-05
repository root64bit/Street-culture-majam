import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Header } from '@/components/layout/Header';
import { CommerceProvider } from '@/features/commerce/CommerceProvider';

function renderHeader() {
  return render(<CommerceProvider><Header /></CommerceProvider>);
}

describe('Header component', () => {
  it('renders the storefront brand', () => {
    renderHeader();
    expect(screen.getByRole('img', { name: 'Street Culture — Authentic Only' })).toBeInTheDocument();
  });

  it('renders core navigation links', () => {
    renderHeader();
    expect(screen.getByText('NEW')).toBeInTheDocument();
    expect(screen.getByText('SNEAKERS')).toBeInTheDocument();
    expect(screen.getByText('STREETWEAR')).toBeInTheDocument();
    expect(screen.getByText('LUXURY')).toBeInTheDocument();
    expect(screen.getByText('ACCESSORIES')).toBeInTheDocument();
    expect(screen.getByText('BRANDS')).toBeInTheDocument();
    expect(screen.getByText('SELL')).toBeInTheDocument();
  });

  it('renders search, wishlist and an empty bag', () => {
    renderHeader();
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByLabelText('Wishlist')).toBeInTheDocument();
    expect(screen.getByLabelText('Bag with 0 items')).toBeInTheDocument();
  });
});
