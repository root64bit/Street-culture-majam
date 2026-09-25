import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Header } from '@/components/layout/Header';

describe('Header component', () => {
  it('renders brand logo and vault moniker', () => {
    render(<Header />);
    expect(screen.getByText('STREET CULTURE')).toBeInTheDocument();
    expect(screen.getByText('ARCHIVAL VAULT')).toBeInTheDocument();
  });

  it('renders core navigation links', () => {
    render(<Header />);
    expect(screen.getByText('NEW IN')).toBeInTheDocument();
    expect(screen.getByText('SNEAKERS')).toBeInTheDocument();
    expect(screen.getByText('STREETWEAR')).toBeInTheDocument();
    expect(screen.getByText('LUXURY')).toBeInTheDocument();
    expect(screen.getByText('ACCESSORIES')).toBeInTheDocument();
    expect(screen.getByText('BRANDS')).toBeInTheDocument();
    expect(screen.getByText('CONSIGN')).toBeInTheDocument();
  });

  it('renders command search bar and wishlist counter', () => {
    render(<Header />);
    expect(screen.getByText('COMMAND + K')).toBeInTheDocument();
    expect(screen.getByLabelText('Wishlist')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
